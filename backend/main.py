import os
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, HTTPException, Depends, status, UploadFile, File, Form, Request
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
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from urllib.parse import urlparse, urlunparse, parse_qs, urlencode

# ================== تنظیمات NCBI ==================
Entrez.email = "mkoolivand14@gmail.com"

# ================== تنظیمات Rate Limiting ==================
limiter = Limiter(key_func=get_remote_address)

# ================== تنظیمات دیتابیس ==================
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    DATABASE_URL = "sqlite:///./primerai.db"

if "neon.tech" in DATABASE_URL:
    parsed = urlparse(DATABASE_URL)
    query = parse_qs(parsed.query)
    query.pop('sslmode', None)
    query.pop('channel_binding', None)
    new_query = urlencode(query, doseq=True)
    DATABASE_URL = urlunparse(parsed._replace(query=new_query))

if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

database = databases.Database(DATABASE_URL)
metadata = sqlalchemy.MetaData()

users_table = sqlalchemy.Table(
    "users", metadata,
    sqlalchemy.Column("id", sqlalchemy.Integer, primary_key=True),
    sqlalchemy.Column("email", sqlalchemy.String, unique=True, index=True),
    sqlalchemy.Column("hashed_password", sqlalchemy.String),
    sqlalchemy.Column("plan", sqlalchemy.String, default="free"),
    sqlalchemy.Column("created_at", sqlalchemy.DateTime, server_default=sqlalchemy.func.now()),
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
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
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
    degenerate: bool = False

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

class TmRequest(BaseModel):
    sequence: str
    method: str = "nearest_neighbor"

class OrderFormatRequest(BaseModel):
    sequence: str
    company: str = "IDT"

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
        query = users_table.select().where(users_table.c.email == email)
        user = await database.fetch_one(query)
        if not user: raise HTTPException(status_code=401, detail="User not found")
        return dict(user)
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

def calculate_tm(seq, method="nearest_neighbor"):
    if method == "basic":
        a = seq.upper().count('A'); t = seq.upper().count('T'); g = seq.upper().count('G'); c = seq.upper().count('C')
        return 2*(a+t) + 4*(g+c)
    else:
        return round(primer3.calc_tm(seq), 2)

def format_for_company(seq, company):
    if company == "IDT":
        return f"{seq} (IDT Standard Desalting)"
    elif company == "Twist":
        return f"{seq} (Twist Bioscience)"
    else:
        return seq

# ================== مسیرهای احراز هویت ==================
@app.post("/register")
async def register(user: UserCreate):
    query = users_table.select().where(users_table.c.email == user.email)
    if await database.fetch_one(query):
        raise HTTPException(status_code=400, detail="Email already registered")
    hashed = get_password_hash(user.password)
    await database.execute(users_table.insert().values(email=user.email, hashed_password=hashed, plan="free"))
    return {"message": "User created successfully"}

@app.post("/login")
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    query = users_table.select().where(users_table.c.email == form_data.username)
    user = await database.fetch_one(query)
    if not user or not verify_password(form_data.password, user["hashed_password"]):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    token = create_access_token(data={"sub": user["email"]})
    return {"access_token": token, "token_type": "bearer"}

@app.delete("/delete-account")
async def delete_account(current_user: dict = Depends(get_current_user)):
    email = current_user["email"]
    await database.execute(users_table.delete().where(users_table.c.email == email))
    await database.execute(saved_primers_table.delete().where(saved_primers_table.c.user_email == email))
    return {"message": "Account and all associated data deleted successfully."}

@app.get("/user/profile")
async def get_profile(current_user: dict = Depends(get_current_user)):
    return {"email": current_user["email"], "plan": current_user["plan"]}

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
@limiter.limit("10/minute")
async def chat_design(request: Request, req: ChatRequest):
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
        
        if req.mode == "qpcr":
            result[f"PRIMER_PAIR_{i}_QPCR_WARNING"] = "Warning: Primer may amplify genomic DNA. Ensure it spans an exon-exon junction."

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
                "PRIMER_NUM_RETURN": 1
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

@app.post("/suggest-protocol")
def suggest_protocol(anneal_temp: float, gc_content: float):
    protocol = {
        "annealing_temp": anneal_temp,
        "extension_time": "30 seconds per kb",
        "initial_denaturation": "95°C for 5 min",
        "denaturation": "95°C for 30 sec",
        "annealing": f"{anneal_temp}°C for 30 sec",
        "extension": "72°C for 1 min (for 1kb)",
        "final_extension": "72°C for 5 min",
        "additives": []
    }
    if gc_content > 65:
        protocol["additives"].append("Consider adding DMSO (5-10%) or GC Enhancer due to high GC content.")
    if gc_content < 40:
        protocol["additives"].append("Consider adding BSA or increasing Mg2+ concentration due to low GC content.")
    
    return {"protocol": protocol}

@app.post("/calculate-tm")
def calculate_tm_endpoint(req: TmRequest):
    tm = calculate_tm(req.sequence, req.method)
    return {"sequence": req.sequence, "tm": tm, "method": req.method}

@app.post("/order-format")
def order_format(req: OrderFormatRequest):
    formatted = format_for_company(req.sequence, req.company)
    return {"original": req.sequence, "formatted": formatted, "company": req.company}

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
async def save_primer(req: SavePrimerRequest, current_user: dict = Depends(get_current_user)):
    await database.execute(saved_primers_table.insert().values(
        user_email=current_user["email"], name=req.name, left_seq=req.left_seq, right_seq=req.right_seq, tm=req.tm
    ))
    return {"message": "Primer saved successfully"}

@app.get("/my-primers")
async def get_my_primers(current_user: dict = Depends(get_current_user)):
    query = saved_primers_table.select().where(saved_primers_table.c.user_email == current_user["email"])
    results = await database.fetch_all(query)
    return {"primers": [dict(row) for row in results]}

@app.post("/experimental-feedback")
async def submit_experimental_feedback(req: ExperimentalFeedbackRequest):
    await database.execute(experimental_feedback_table.insert().values(primer_pair=req.primer_pair, result=req.result))
    return {"status": "success", "message": "Experimental feedback saved!"}