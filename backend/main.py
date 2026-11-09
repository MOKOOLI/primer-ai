import os
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, HTTPException, Depends, status, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel
from datetime import datetime, timedelta
from jose import JWTError, jwt
import bcrypt
import databases
import sqlalchemy
from Bio import SeqIO, Align, Entrez
from io import StringIO
import primer3
import requests
from typing import List

# ================== تنظیمات NCBI ==================
Entrez.email = "mkoolivand14@gmail.com" # ⚠️ ایمیل خود را اینجا وارد کنید

# ================== تنظیمات دیتابیس ==================
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    DATABASE_URL = "sqlite:///./primerai.db"
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

database = databases.Database(DATABASE_URL)
metadata = sqlalchemy.MetaData()

users_table = sqlalchemy.Table(
    "users", metadata,
    sqlalchemy.Column("id", sqlalchemy.Integer, primary_key=True),
    sqlalchemy.Column("email", sqlalchemy.String, unique=True, index=True),
    sqlalchemy.Column("hashed_password", sqlalchemy.String),
)
feedback_table = sqlalchemy.Table(
    "feedbacks", metadata,
    sqlalchemy.Column("id", sqlalchemy.Integer, primary_key=True),
    sqlalchemy.Column("primer_sequence", sqlalchemy.String),
    sqlalchemy.Column("rating", sqlalchemy.Integer),
    sqlalchemy.Column("comment", sqlalchemy.String),
    sqlalchemy.Column("created_at", sqlalchemy.DateTime, server_default=sqlalchemy.func.now()),
)
saved_primers_table = sqlalchemy.Table(
    "saved_primers", metadata,
    sqlalchemy.Column("id", sqlalchemy.Integer, primary_key=True),
    sqlalchemy.Column("user_email", sqlalchemy.String),
    sqlalchemy.Column("name", sqlalchemy.String),
    sqlalchemy.Column("left_seq", sqlalchemy.String),
    sqlalchemy.Column("right_seq", sqlalchemy.String),
    sqlalchemy.Column("tm", sqlalchemy.Float),
    sqlalchemy.Column("created_at", sqlalchemy.DateTime, server_default=sqlalchemy.func.now()),
)
experimental_feedback_table = sqlalchemy.Table(
    "experimental_feedback", metadata,
    sqlalchemy.Column("id", sqlalchemy.Integer, primary_key=True),
    sqlalchemy.Column("primer_pair", sqlalchemy.String),
    sqlalchemy.Column("result", sqlalchemy.String),
    sqlalchemy.Column("created_at", sqlalchemy.DateTime, server_default=sqlalchemy.func.now()),
)

engine = sqlalchemy.create_engine(DATABASE_URL, connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {})
metadata.create_all(engine)

# ================== تنظیمات امنیتی ==================
SECRET_KEY = os.getenv("SECRET_KEY", "super-secret-key-for-primer-ai")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")

app = FastAPI(title="Primer AI API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=False, allow_methods=["*"], allow_headers=["*"])

@app.on_event("startup")
async def startup(): await database.connect()
@app.on_event("shutdown")
async def shutdown(): await database.disconnect()

# ================== مدل‌ها ==================
class UserCreate(BaseModel):
    email: str
    password: str

class ChatRequest(BaseModel):
    sequence: str
    user_prompt: str
    tail_sequence: str = ""
    mutation: str = ""
    mode: str = "standard"
    degenerate: bool = False # ✅ فیلد جدید برای پرایمرهای دژنره

class MultiplexRequest(BaseModel):
    sequences: List[str]
    user_prompt: str
    mode: str = "standard"

class FeedbackRequest(BaseModel):
    primer_sequence: str
    rating: int
    comment: str = ""

class BlastRequest(BaseModel):
    primer_sequence: str

class SavePrimerRequest(BaseModel):
    name: str
    left_seq: str
    right_seq: str
    tm: float

class ExperimentalFeedbackRequest(BaseModel):
    primer_pair: str
    result: str

# ================== توابع امنیتی ==================
def verify_password(plain_password, hashed_password):
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))
def get_password_hash(password):
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

async def get_current_user(token: str = Depends(oauth2_scheme)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email = payload.get("sub")
        if email is None: raise HTTPException(status_code=401, detail="Invalid token")
        return email
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

# ================== توابع کمکی ==================
def get_risk_level(value):
    if value < 50: return "Low"
    elif value < 100: return "Medium"
    else: return "High"

def apply_mutation(seq, mutation_str):
    if not mutation_str: return seq
    import re
    match = re.match(r'([A-Z])(\d+)([A-Z])', mutation_str.upper())
    if not match: return seq
    orig, pos, new = match.groups()
    pos = int(pos)
    if pos < 1 or pos > len(seq): return seq
    if seq[pos-1] != orig: return seq
    return seq[:pos-1] + new + seq[pos:]

# ================== مسیرهای احراز هویت ==================
@app.post("/register")
async def register(user: UserCreate):
    query = users_table.select().where(users_table.c.email == user.email)
    if await database.fetch_one(query):
        raise HTTPException(status_code=400, detail="Email already registered")
    hashed = get_password_hash(user.password)
    await database.execute(users_table.insert().values(email=user.email, hashed_password=hashed))
    return {"message": "User created successfully"}

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
def read_root(): return {"message": "Server is running perfectly!"}

@app.post("/fetch-gene")
def fetch_gene(gene_name: str):
    try:
        handle = Entrez.esearch(db="nucleotide", term=f"{gene_name}[Gene] AND Homo sapiens[Organism]", retmax=1)
        record = Entrez.read(handle)
        handle.close()
        if not record["IdList"]: raise HTTPException(status_code=404, detail="Gene not found")
        gene_id = record["IdList"][0]
        fetch_handle = Entrez.efetch(db="nucleotide", id=gene_id, rettype="fasta", retmode="text")
        fasta_data = fetch_handle.read()
        fetch_handle.close()
        sequence = "".join(fasta_data.strip().split("\n")[1:])
        return {"gene_name": gene_name, "sequence": sequence, "length": len(sequence)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/chat-design")
def chat_design(req: ChatRequest):
    import re
    match = re.search(r'\b(5[0-9]|6[0-9]|7[0-5])\b', req.user_prompt)
    target_temp = float(match.group(1)) if match else 60.0
    mutated_seq = apply_mutation(req.sequence, req.mutation)
    
    global_args = {
        "PRIMER_OPT_TM": target_temp, 
        "PRIMER_MIN_TM": target_temp - 3, 
        "PRIMER_MAX_TM": target_temp + 3, 
        "PRIMER_NUM_RETURN": 3
    }

    if req.mode == "qpcr":
        global_args["PRIMER_PRODUCT_SIZE_RANGE"] = [[70, 150]]
        global_args["PRIMER_PICK_INTERNAL_OLIGO"] = 1
        global_args["PRIMER_INTERNAL_OPT_TM"] = target_temp + 10
        global_args["PRIMER_INTERNAL_MIN_TM"] = target_temp + 7
        global_args["PRIMER_INTERNAL_MAX_TM"] = target_temp + 13
    elif req.mode == "sanger":
        global_args["PRIMER_PRODUCT_SIZE_RANGE"] = [[200, 800]]
    else:
        global_args["PRIMER_PRODUCT_SIZE_RANGE"] = [[50, 300]]

    # ✅ پشتیبانی از پرایمرهای دژنره
    if req.degenerate:
        global_args["PRIMER_DEGENERATE"] = 1
        global_args["PRIMER_MAX_DEGENERATE"] = 4

    result = primer3.bindings.design_primers(
        seq_args={"SEQUENCE_ID": "user_seq", "SEQUENCE_TEMPLATE": mutated_seq},
        global_args=global_args,
    )
    
    for i in range(result.get("PRIMER_LEFT_NUM_RETURNED", 0)):
        left_tm = result.get(f"PRIMER_LEFT_{i}_TM", 0)
        right_tm = result.get(f"PRIMER_RIGHT_{i}_TM", 0)
        ann_temp = min(left_tm, right_tm) - 5 if (left_tm and right_tm) else 0
        result[f"PRIMER_PAIR_{i}_ANNEAL_TEMP"] = round(ann_temp, 1)
        result[f"PRIMER_LEFT_{i}_HAIRPIN_RISK"] = get_risk_level(result.get(f"PRIMER_LEFT_{i}_HAIRPIN_TH", 0))
        result[f"PRIMER_RIGHT_{i}_HAIRPIN_RISK"] = get_risk_level(result.get(f"PRIMER_RIGHT_{i}_HAIRPIN_TH", 0))
        result[f"PRIMER_PAIR_{i}_DIMER_RISK"] = get_risk_level(result.get(f"PRIMER_PAIR_{i}_COMPL_ANY_TH", 0))
        
        if req.tail_sequence:
            result[f"PRIMER_LEFT_{i}_SEQUENCE_WITH_TAIL"] = req.tail_sequence + result[f"PRIMER_LEFT_{i}_SEQUENCE"]
            result[f"PRIMER_RIGHT_{i}_SEQUENCE_WITH_TAIL"] = req.tail_sequence + result[f"PRIMER_RIGHT_{i}_SEQUENCE"]

    return {"extracted_parameters": {"target_temp": target_temp, "mutation_applied": req.mutation}, "primers": result}

@app.post("/multiplex-design")
def multiplex_design(req: MultiplexRequest):
    import re
    match = re.search(r'\b(5[0-9]|6[0-9]|7[0-5])\b', req.user_prompt)
    target_temp = float(match.group(1)) if match else 60.0
    
    results = []
    for seq in req.sequences:
        result = primer3.bindings.design_primers(
            seq_args={"SEQUENCE_ID": "user_seq", "SEQUENCE_TEMPLATE": seq},
            global_args={
                "PRIMER_OPT_TM": target_temp,
                "PRIMER_MIN_TM": target_temp - 3,
                "PRIMER_MAX_TM": target_temp + 3,
                "PRIMER_PRODUCT_SIZE_RANGE": [[50, 300]],
                "PRIMER_NUM_RETURN": 1 # فقط یک جفت برای هر توالی در مولتی‌پلکس
            },
        )
        results.append(result)

    return {"status": "success", "results": results}

@app.post("/analyze-sequence")
async def analyze_sequence(file: UploadFile = File(...), reference: str = Form(...)):
    try:
        content = await file.read()
        text = content.decode("utf-8")
        record = SeqIO.read(StringIO(text), "fasta")
        query_seq = str(record.seq).upper()
        ref_seq = reference.upper()
        aligner = Align.PairwiseAligner()
        aligner.mode = 'global'
        alignments = aligner.align(ref_seq, query_seq)
        score = alignments[0].score
        identity = (score / len(ref_seq)) * 100 if len(ref_seq) > 0 else 0
        return {"status": "success", "sequence_length": len(query_seq), "identity_percentage": round(identity, 2), "alignment_score": score}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/feedback")
async def submit_feedback(req: FeedbackRequest):
    await database.execute(feedback_table.insert().values(primer_sequence=req.primer_sequence, rating=req.rating, comment=req.comment))
    return {"status": "success", "message": "Feedback saved to database!"}

@app.post("/verify-primer")
def verify_primer(req: BlastRequest):
    try:
        from Bio.Blast import NCBIWWW, NCBIXML
        handle = NCBIWWW.qblast(program="blastn", database="refseq_rna", sequence=req.primer_sequence, megablast=True, hitlist_size=5)
        record = NCBIXML.read(handle)
        handle.close()
        hits = [{"title": a.title, "e_value": h.expect} for a in record.alignments for h in a.hsps if h.expect < 0.1]
        return {"status": "success", "total_hits": len(hits), "top_hits": hits}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/save-primer")
async def save_primer(req: SavePrimerRequest, current_user: str = Depends(get_current_user)):
    await database.execute(saved_primers_table.insert().values(
        user_email=current_user, name=req.name, left_seq=req.left_seq, right_seq=req.right_seq, tm=req.tm
    ))
    return {"message": "Primer saved successfully"}

@app.get("/my-primers")
async def get_my_primers(current_user: str = Depends(get_current_user)):
    query = saved_primers_table.select().where(saved_primers_table.c.user_email == current_user)
    results = await database.fetch_all(query)
    return {"primers": [dict(row) for row in results]}

@app.post("/experimental-feedback")
async def submit_experimental_feedback(req: ExperimentalFeedbackRequest):
    await database.execute(experimental_feedback_table.insert().values(primer_pair=req.primer_pair, result=req.result))
    return {"status": "success", "message": "Experimental feedback saved!"}