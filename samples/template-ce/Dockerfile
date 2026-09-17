FROM python:3.11-slim

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Add user app
RUN useradd -u 1001 app

# Create the app directory and set permissions to app
RUN mkdir /home/app/ && chown -R app:app /home/app

WORKDIR /home/app

# Copy dependency files
COPY --chown=app:app pyproject.toml uv.lock ./

# Run the application as user app
USER app

# Install dependencies using uv
RUN uv sync --frozen --no-dev

# Copy the source code to the working directory
COPY --chown=app:app src/ ./src/

# Copy proto files and generated code
COPY --chown=app:app proto/ ./proto/

# Expose gRPC port
EXPOSE 50051

# Command to run gRPC server on container start
CMD ["uv", "run", "python", "-m", "src.service"]
