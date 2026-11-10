import os
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, HTTPException, Depends, status, UploadFile, File, Form, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr
from datetime import datetime, timedelta
from jose import JWTError, jwt
import bcrypt
import databases
import sqlalchemy
from Bio import SeqIO, Align, Entrez
from Bio.Seq import Seq
from io import StringIO
import primer3
import requests
from typing import List
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from urllib.parse import urlparse, urlunparse, parse_qs, urlencode
import re

# ================== تنظیمات NCBI ==================
Entrez.email = os.getenv("ENTREZ_EMAIL", "mkoolivand14@gmail.com")

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
SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    # برای امنیت، در محیط پروداکشن حتماً باید تنظیم شود
    SECRET_KEY = "super-secret-key-for-primer-ai-DEVELOPMENT-ONLY"

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
    email: EmailStr
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
    details: str = ""

class TmRequest(BaseModel):
    sequence: str
    method: str = "nearest_neighbor"

class OrderFormatRequest(BaseModel):
    sequence: str
    company: str = "IDT"

class GibsonRequest(BaseModel):
    insert_sequence: str
    vector_sequence: str
    overlap_length: int = 20

class CRISPRRequest(BaseModel):
    sequence: str
    pam: str = "NGG"

class StructureRequest(BaseModel):
    sequence: str

# ================== توابع امنیتی ==================
def verify_password(plain_password, hashed_password):
    # bcrypt فقط 72 بایت اول را می‌خواند
    password_bytes = plain_password.encode('utf-8')[:72]
    return bcrypt.checkpw(password_bytes, hashed_password.encode('utf-8'))

def get_password_hash(password):
    password_bytes = password.encode('utf-8')[:72]
    return bcrypt.hashpw(password_bytes, bcrypt.gensalt()).decode('utf-8')

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
def sanitize_sequence(seq):
    """پاکسازی توالی از کاراکترهای غیرمجاز و هدر FASTA"""
    if not seq: return ""
    lines = [line for line in seq.strip().split('\n') if not line.startswith('>')]
    clean_seq = "".join(lines).upper().replace(" ", "").replace("\r", "")
    return re.sub(r'[^ATGC]', '', clean_seq)

def get_risk_level(value, anneal_temp):
    """محاسبه ریسک بر اساس اختلاف با دمای اتصال (معیار علمی‌تر)"""
    diff = value - anneal_temp
    if diff < 5: return "Low"
    elif diff < 10: return "Medium"
    else: return "High"

def apply_mutation(seq, mutation_str):
    if not mutation_str: return seq, False
    match = re.match(r'([A-Z])(\d+)([A-Z])', mutation_str.upper())
    if not match: return seq, False
    orig, pos, new = match.groups()
    pos = int(pos)
    if pos < 1 or pos > len(seq) or seq[pos-1] != orig:
        return seq, False
    return seq[:pos-1] + new + seq[pos:], True

def translate_persian_numbers(text):
    """ترجمه اعداد فارسی و عربی به انگلیسی برای regex"""
    translation_table = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")
    return text.translate(translation_table)

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

def find_crispr_guides(sequence, pam="NGG"):
    sequence = sequence.upper()
    guides = []
    pam_len = len(pam)
    
    # جستجو در رشته Forward
    for i in range(len(sequence) - 20 - pam_len + 1):
        candidate_pam = sequence[i+20:i+20+pam_len]
        is_pam_valid = all(pam[j] == 'N' or pam[j] == candidate_pam[j] for j in range(pam_len))
        if is_pam_valid:
            guide_seq = sequence[i:i+20]
            if "TTTT" not in guide_seq: # فیلتر ترمیناتور
                guides.append({
                    "guide": guide_seq, "pam": candidate_pam, "start": i, "strand": "+",
                    "gc_content": round((guide_seq.count('G') + guide_seq.count('C')) / 20 * 100, 1)
                })

    # جستجو در رشته Reverse-Complement
    rev_comp = str(Seq(sequence).reverse_complement())
    for i in range(len(rev_comp) - 20 - pam_len + 1):
        candidate_pam = rev_comp[i+20:i+20+pam_len]
        is_pam_valid = all(pam[j] == 'N' or pam[j] == candidate_pam[j] for j in range(pam_len))
        if is_pam_valid:
            guide_seq = rev_comp[i:i+20]
            if "TTTT" not in guide_seq:
                guides.append({
                    "guide": guide_seq, "pam": candidate_pam, "start": len(sequence) - i - 20, "strand": "-",
                    "gc_content": round((guide_seq.count('G') + guide_seq.count('C')) / 20 * 100, 1)
                })
    return guides

def predict_structure_esm(sequence):
    url = "https://api.esmatlas.com/foldSequence/v1/pdb/"
    headers = {"Content-Type": "text/plain"}
    try:
        response = requests.post(url, data=sequence, headers=headers, timeout=120)
        return response.text if response.status_code == 200 else None
    except Exception as e:
        print(f"ESMFold Error: {e}")
        return None

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
        # استفاده از RefSeq برای دریافت توالی مرجع mRNA
        handle = Entrez.esearch(db="nucleotide", term=f"{gene_name}[Gene] AND Homo sapiens[Organism] AND refseq[Filter]", retmax=1)
        record = Entrez.read(handle)
        handle.close()
        if not record["IdList"]: 
            raise HTTPException(status_code=404, detail="Gene not found or not a reference sequence")
        gene_id = record["IdList"][0]
        fetch_handle = Entrez.efetch(db="nucleotide", id=gene_id, rettype="fasta", retmode="text")
        fasta_data = fetch_handle.read()
        fetch_handle.close()
        sequence = sanitize_sequence("".join(fasta_data.strip().split("\n")[1:]))
        return {"gene_name": gene_name, "sequence": sequence, "length": len(sequence)}
    except HTTPException: raise
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to fetch gene from NCBI")

@app.post("/chat-design")
@limiter.limit("10/minute")
async def chat_design(request: Request, req: ChatRequest):
    try:
        # ۱. پاکسازی توالی و ترجمه اعداد
        seq = sanitize_sequence(req.sequence)
        if not seq or len(seq) > 5000:
            raise HTTPException(status_code=400, detail="Invalid sequence length (max 5000 bp)")
        
        cleaned_prompt = translate_persian_numbers(req.user_prompt)
        
        # ۲. استخراج دما (بهبود regex)
        # جستجو برای الگوهای "۶۵ درجه" یا "65°C" یا "temp 65"
        temp_match = re.search(r'(?:دما|temp|temperature)\s*(?:را\s*)?(?:روی\s*)?(\d{2})', cleaned_prompt, re.IGNORECASE)
        if temp_match:
            target_temp = float(temp_match.group(1))
        else:
            # اگر الگو پیدا نشد، اولین عدد بین 50-75 را بگیر
            match = re.search(r'\b(5[0-9]|6[0-9]|7[0-5])\b', cleaned_prompt)
            target_temp = float(match.group(1)) if match else 60.0

        # ۳. اعمال جهش
        mutated_seq, mutation_success = apply_mutation(seq, req.mutation)
        if req.mutation and not mutation_success:
            # به جای خطا، فقط یک هشدار می‌دهیم یا نادیده می‌گیریم
            print(f"Mutation {req.mutation} could not be applied.")

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

        # حذف پارامترهای ناسازگار degenerate (چون احتمالاً کار نمی‌کند)
        # if req.degenerate: ...

        result = primer3.bindings.design_primers(
            seq_args={"SEQUENCE_ID": "user_seq", "SEQUENCE_TEMPLATE": mutated_seq},
            global_args=global_args,
        )
        
        # ۴. محاسبه ریسک (نسبت به دمای اتصال) و دمای Annealing
        for i in range(result.get("PRIMER_LEFT_NUM_RETURNED", 0)):
            left_tm = result.get(f"PRIMER_LEFT_{i}_TM", 0)
            right_tm = result.get(f"PRIMER_RIGHT_{i}_TM", 0)
            ann_temp = min(left_tm, right_tm) - 5 if (left_tm and right_tm) else 0
            result[f"PRIMER_PAIR_{i}_ANNEAL_TEMP"] = round(ann_temp, 1)
            
            result[f"PRIMER_LEFT_{i}_HAIRPIN_RISK"] = get_risk_level(result.get(f"PRIMER_LEFT_{i}_HAIRPIN_TH", 0), ann_temp)
            result[f"PRIMER_RIGHT_{i}_HAIRPIN_RISK"] = get_risk_level(result.get(f"PRIMER_RIGHT_{i}_HAIRPIN_TH", 0), ann_temp)
            # استفاده از COMPL_END_TH برای Dimer در انتهای ۳'
            result[f"PRIMER_PAIR_{i}_DIMER_RISK"] = get_risk_level(result.get(f"PRIMER_PAIR_{i}_COMPL_END_TH", 0), ann_temp)
            
            if req.mode == "qpcr":
                result[f"PRIMER_PAIR_{i}_QPCR_WARNING"] = "Warning: Ensure primers span an exon-exon junction to avoid gDNA amplification."

            if req.tail_sequence:
                result[f"PRIMER_LEFT_{i}_SEQUENCE_WITH_TAIL"] = req.tail_sequence + result[f"PRIMER_LEFT_{i}_SEQUENCE"]
                result[f"PRIMER_RIGHT_{i}_SEQUENCE_WITH_TAIL"] = req.tail_sequence + result[f"PRIMER_RIGHT_{i}_SEQUENCE"]

        return {
            "extracted_parameters": {"target_temp": target_temp, "mutation_applied": req.mutation if mutation_success else ""}, 
            "primers": result
        }
    except HTTPException: raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Primer design failed: {str(e)}")

@app.post("/multiplex-design")
def multiplex_design(req: MultiplexRequest):
    # برای سادگی، فعلاً همان طراحی مستقل را انجام می‌دهیم
    results = []
    for seq in req.sequences:
        cleaned_seq = sanitize_sequence(seq)
        result = primer3.bindings.design_primers(
            seq_args={"SEQUENCE_ID": "user_seq", "SEQUENCE_TEMPLATE": cleaned_seq},
            global_args={
                "PRIMER_OPT_TM": 60.0, "PRIMER_MIN_TM": 57.0, "PRIMER_MAX_TM": 63.0,
                "PRIMER_PRODUCT_SIZE_RANGE": [[50, 300]], "PRIMER_NUM_RETURN": 1
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
        ref_seq = sanitize_sequence(reference)
        aligner = Align.PairwiseAligner()
        aligner.mode = 'global'
        alignments = aligner.align(ref_seq, query_seq)
        score = alignments[0].score
        identity = (score / len(ref_seq)) * 100 if len(ref_seq) > 0 else 0
        return {"status": "success", "sequence_length": len(query_seq), "identity_percentage": round(identity, 2), "alignment_score": score}
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to analyze sequence")

@app.post("/suggest-protocol")
def suggest_protocol(anneal_temp: float, gc_content: float, product_size: int = 1000):
    # محاسبه زمان extension بر اساس طول محصول
    ext_time_sec = int((product_size / 1000) * 60)
    if ext_time_sec < 30: ext_time_sec = 30
    
    protocol = {
        "annealing_temp": anneal_temp,
        "extension_time": f"{ext_time_sec} seconds",
        "initial_denaturation": "95°C for 3 min",
        "denaturation": "95°C for 30 sec",
        "annealing": f"{anneal_temp}°C for 30 sec",
        "extension": f"72°C for {ext_time_sec} sec",
        "final_extension": "72°C for 5 min",
        "cycles": "30-35 cycles",
        "additives": []
    }
    if gc_content > 65:
        protocol["additives"].append("Consider adding DMSO (5-10%) or GC Enhancer due to high GC content.")
    return {"protocol": protocol}

@app.post("/calculate-tm")
def calculate_tm_endpoint(req: TmRequest):
    tm = calculate_tm(req.sequence, req.method)
    return {"sequence": req.sequence, "tm": tm, "method": req.method}

@app.post("/order-format")
def order_format(req: OrderFormatRequest):
    formatted = format_for_company(req.sequence, req.company)
    return {"original": req.sequence, "formatted": formatted, "company": req.company}

@app.post("/gibson-design")
def gibson_design(req: GibsonRequest):
    try:
        insert = sanitize_sequence(req.insert_sequence)
        vector = sanitize_sequence(req.vector_sequence)
        overlap = req.overlap_length
        
        if len(vector) < overlap * 2:
            raise HTTPException(status_code=400, detail="Vector sequence too short")
        
        # ✅ اصلاح Gibson: reverse-complement کردن دنباله و اجبار پرایمرها به انتهای Insert
        forward_overlap = vector[-overlap:]
        reverse_overlap = str(Seq(vector[:overlap]).reverse_complement())
        
        seq_args = {
            "SEQUENCE_ID": "gibson_insert", 
            "SEQUENCE_TEMPLATE": insert,
            "SEQUENCE_FORCE_LEFT_START": 0,
            "SEQUENCE_FORCE_RIGHT_END": len(insert) - 1
        }
        
        result = primer3.bindings.design_primers(
            seq_args=seq_args,
            global_args={
                "PRIMER_OPT_TM": 60.0, "PRIMER_MIN_TM": 57.0, "PRIMER_MAX_TM": 63.0,
                "PRIMER_PRODUCT_SIZE_RANGE": [[len(insert), len(insert)]],
                "PRIMER_NUM_RETURN": 1
            },
        )
        
        if result.get("PRIMER_LEFT_NUM_RETURNED", 0) == 0:
            raise HTTPException(status_code=400, detail="Could not design primers for insert")
        
        left_seq = result["PRIMER_LEFT_0_SEQUENCE"]
        right_seq = result["PRIMER_RIGHT_0_SEQUENCE"]
        
        # ✅ محاسبه Tm فقط روی بخش annealing (بدون Overlap)
        return {
            "status": "success",
            "insert_primers": {
                "forward": forward_overlap + left_seq,
                "reverse": reverse_overlap + right_seq,
                "forward_overlap": forward_overlap,
                "reverse_overlap": reverse_overlap,
                "forward_tm": calculate_tm(left_seq),   # فقط بخش annealing
                "reverse_tm": calculate_tm(right_seq)   # فقط بخش annealing
            }
        }
    except HTTPException: raise
    except Exception as e:
        raise HTTPException(status_code=500, detail="Gibson assembly failed")

@app.post("/crispr-design")
def crispr_design(req: CRISPRRequest):
    try:
        cleaned_seq = sanitize_sequence(req.sequence)
        guides = find_crispr_guides(cleaned_seq, req.pam)
        # مرتب‌سازی ساده بر اساس GC (نزدیک به ۵۰)
        guides.sort(key=lambda x: abs(x["gc_content"] - 50))
        return {"status": "success", "total_guides": len(guides), "top_guides": guides[:10]}
    except Exception as e:
        raise HTTPException(status_code=500, detail="CRISPR design failed")

@app.post("/predict-structure")
def predict_structure(req: StructureRequest):
    try:
        pdb_data = predict_structure_esm(req.sequence)
        if pdb_data is None:
            raise HTTPException(status_code=500, detail="ESMFold API failed")
        return {"status": "success", "pdb_data": pdb_data}
    except HTTPException: raise
    except Exception as e:
        raise HTTPException(status_code=500, detail="Structure prediction failed")

@app.post("/feedback")
async def submit_feedback(req: FeedbackRequest):
    await database.execute(feedback_table.insert().values(primer_sequence=req.primer_sequence, rating=req.rating, comment=req.comment))
    return {"status": "success"}

@app.post("/verify-primer")
@limiter.limit("5/minute")
async def verify_primer(request: Request, req: BlastRequest):
    try:
        from Bio.Blast import NCBIWWW, NCBIXML
        # ✅ اصلاح BLAST: megablast=False و word_size=7
        handle = NCBIWWW.qblast(
            program="blastn", database="refseq_rna", sequence=req.primer_sequence,
            megablast=False, word_size=7, expect=1000, filter=None,
            hitlist_size=5
        )
        record = NCBIXML.read(handle)
        handle.close()
        
        hits = []
        for alignment in record.alignments:
            for hsp in alignment.hsps:
                if hsp.expect < 0.1: # فقط نتایج معنادار
                    hits.append({"title": alignment.title, "e_value": hsp.expect})
        
        return {"status": "success", "total_hits": len(hits), "top_hits": hits}
    except Exception as e:
        raise HTTPException(status_code=500, detail="BLAST search failed")

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
    return {"status": "success"}