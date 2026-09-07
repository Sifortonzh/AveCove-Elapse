FROM python:3.12-slim
WORKDIR /app
COPY pyproject.toml ./forge/pyproject.toml
COPY src ./forge/src
RUN pip install --no-cache-dir ./forge
COPY curriculums ./forge/curriculums
# Intentionally no model downloads or OCR in Elapse's production image.
# Build a separate worker image with your verified MinerU CLI/runtime for OCR.
RUN useradd --uid 10001 --create-home forge && mkdir /data && chown forge:forge /data
USER forge
ENV FORGE_STORAGE_ROOT=/data FORGE_CURRICULUM_DIR=/app/forge/curriculums
CMD ["uvicorn", "elapse_forge.api:app", "--host", "0.0.0.0", "--port", "8091"]
