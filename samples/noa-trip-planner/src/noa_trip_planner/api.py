# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

import os
from typing import Literal

import uvicorn

from fastapi import FastAPI
from pydantic import BaseModel
from noa_trip_planner.multi_agent_system import ask_question
from importlib.metadata import version
from dotenv import load_dotenv


load_dotenv()  # Load environment variables from .env file
app = FastAPI(title="NOA Trip Planner API")


@app.get("/")
def root():
    return {"message": "NOA Trip Planner API"}


@app.get("/health")
def health():
    return {"status": "healthy"}

@app.get("/version")
def get_pkg_version():
    return {"version": version("noa-trip-planner")}


class AskRequest(BaseModel):
    question: str
    thread_id: str = "default"
    debugging: bool = True
    # None = all agents, [] = moderator only
    available_agents: list[Literal["schedule_agent", "itinerary_agent", "concierge_agent"]] | None = None


@app.post("/ask")
def ask(payload: AskRequest):
    result = ask_question(
        payload.question,
        payload.thread_id,
        payload.debugging,
        available_agents=payload.available_agents,
    )
    return result

def main():
    port = int(os.environ.get("NOA_API_PORT", 8000))
    host = os.environ.get("NOA_API_HOST", "0.0.0.0")
    uvicorn.run(app, host=host, port=port, timeout_keep_alive=3600)

if __name__ == "__main__":
    main()
