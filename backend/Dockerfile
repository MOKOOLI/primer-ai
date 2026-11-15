FROM python:3.11-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    BOOST_ROOT=/usr \
    BOOST_INCLUDEDIR=/usr/include \
    BOOST_LIBRARYDIR=/usr/lib/x86_64-linux-gnu

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    g++ \
    swig \
    libboost-all-dev \
    libboost-python-dev \
    libboost-system-dev \
    libboost-filesystem-dev \
    libboost-thread-dev \
    libboost-serialization-dev \
    libboost-iostreams-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip setuptools wheel \
    && pip install --no-cache-dir "numpy<2" \
    && pip install --no-cache-dir -r requirements.txt

COPY . .

CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-10000}