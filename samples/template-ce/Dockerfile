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

# Copy the source code to the working directory (not in subdirectory)
COPY --chown=app:app src/ .

# Expose port
EXPOSE 8000

# Command to run on container start
CMD ["uv", "run", "--no-project", "uvicorn", "service:app", "--host", "0.0.0.0", "--port", "8000"]
