import os
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel
from datetime import datetime, timedelta
from jose import JWTError, jwt
import bcrypt
from db_cloud import database, users_table, feedback_table

# ================== تنظیمات امنیتی ==================
SECRET_KEY = os.getenv("SECRET_KEY", "super-secret-key-for-primer-ai")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")

app = FastAPI(title="Primer AI API")

app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"],
)

@app.on_event("startup")
async def startup():
    await database.connect()

@app.on_event("shutdown")
async def shutdown():
    await database.disconnect()

# ================== مدل‌ها ==================
class UserCreate(BaseModel):
    email: str
    password: str

class ChatRequest(BaseModel):
    sequence: str
    user_prompt: str

class FeedbackRequest(BaseModel):
    primer_sequence: str
    rating: int
    comment: str = ""

class BlastRequest(BaseModel):
    primer_sequence: str

# ================== توابع امنیتی ==================
def verify_password(plain_password, hashed_password):
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))

def get_password_hash(password):
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
    return hashed.decode('utf-8')

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

# ================== مسیرهای احراز هویت ==================
@app.post("/register")
async def register(user: UserCreate):
    query = users_table.select().where(users_table.c.email == user.email)
    existing = await database.fetch_one(query)
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    try:
        hashed = get_password_hash(user.password)
        insert_query = users_table.insert().values(email=user.email, hashed_password=hashed)
        await database.execute(insert_query)
        return {"message": "User created successfully"}
    except Exception as e:
        print(f"DATABASE ERROR: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/login")
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    query = users_table.select().where(users_table.c.email == form_data.username)
    user = await database.fetch_one(query)
    
    if not user or not verify_password(form_data.password, user["hashed_password"]):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    
    token = create_access_token(data={"sub": user["email"]})
    return {"access_token": token, "token_type": "bearer"}

# ================== مسیرهای اصلی ==================
@app.get("/")
def read_root():
    return {"message": "Server is running perfectly!"}

@app.post("/chat-design")
def chat_design(req: ChatRequest):
    import primer3
    import re
    temp_match = re.search(r'\b(5[0-9]|6[0-9]|7[0-5])\b', req.user_prompt)
    target_temp = float(temp_match.group(1)) if temp_match else 60.0

    result = primer3.bindings.design_primers(
        seq_args={"SEQUENCE_ID": "user_seq", "SEQUENCE_TEMPLATE": req.sequence},
        global_args={
            "PRIMER_OPT_TM": target_temp,
            "PRIMER_MIN_TM": target_temp - 3,
            "PRIMER_MAX_TM": target_temp + 3,
            "PRIMER_PRODUCT_SIZE_RANGE": [[50, 300]],
            "PRIMER_NUM_RETURN": 3,
        },
    )
    return {"extracted_parameters": {"target_temp": target_temp}, "primers": result}

@app.post("/feedback")
async def submit_feedback(req: FeedbackRequest):
    query = feedback_table.insert().values(
        primer_sequence=req.primer_sequence,
        rating=req.rating,
        comment=req.comment
    )
    await database.execute(query)
    return {"status": "success", "message": "Feedback saved to database!"}

@app.post("/verify-primer")
def verify_primer(req: BlastRequest):
    try:
        from Bio.Blast import NCBIWWW, NCBIXML
        result_handle = NCBIWWW.qblast(
            program="blastn", database="refseq_rna", sequence=req.primer_sequence,
            megablast=True, hitlist_size=5
        )
        blast_record = NCBIXML.read(result_handle)
        result_handle.close()
        
        hits = []
        for alignment in blast_record.alignments:
            for hsp in alignment.hsps:
                if hsp.expect < 0.1:
                    hits.append({"title": alignment.title, "e_value": hsp.expect})
        
        return {"status": "success", "total_hits": len(hits), "top_hits": hits}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))