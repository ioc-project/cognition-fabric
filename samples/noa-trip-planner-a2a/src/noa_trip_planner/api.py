# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

import os
from contextlib import asynccontextmanager
from importlib.metadata import version
from typing import Literal

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel
from a2a.server.routes import create_rest_routes, add_a2a_routes_to_fastapi

from noa_trip_planner.application_runtime import ApplicationRuntime
from noa_trip_planner.multi_agent_system import ask_question
from noa_trip_planner.settings import Settings


load_dotenv()  # Load environment variables from .env file


def create_app(runtime: ApplicationRuntime | None = None) -> FastAPI:
    application_runtime = runtime or ApplicationRuntime(Settings())

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        await application_runtime.start()
        app.state.runtime = application_runtime
        original_routes = list(app.router.routes)
        try:
            for handler in application_runtime.http_handlers.values():
                add_a2a_routes_to_fastapi(app, rest_routes=create_rest_routes(handler, path_prefix=""))
            yield
        finally:
            app.router.routes[:] = original_routes
            await application_runtime.stop()

    application = FastAPI(title="NOA Trip Planner A2A API", lifespan=lifespan)

    @application.get("/")
    def root():
        return {"message": "NOA Trip Planner A2A API"}

    @application.get("/health")
    def health():
        return {"status": "healthy"}

    @application.get("/ready")
    def ready(request: Request):
        current_runtime: ApplicationRuntime = request.app.state.runtime
        if not current_runtime.ready:
            raise HTTPException(status_code=503, detail="Runtime is not ready")
        return {"status": "ready"}

    @application.get("/version")
    def get_pkg_version():
        return {"version": version("noa-trip-planner-a2a")}

    @application.post("/ask")
    async def ask(payload: AskRequest, request: Request):
        current_runtime: ApplicationRuntime = request.app.state.runtime
        if not current_runtime.ready:
            raise HTTPException(status_code=503, detail="Runtime is not ready")
        return await ask_question(
            payload.question,
            current_runtime.require_messenger(),
            payload.thread_id,
            payload.debugging,
            available_agents=payload.available_agents,
        )

    return application


class AskRequest(BaseModel):
    question: str
    thread_id: str = "default"
    debugging: bool = True
    # None = all agents, [] = moderator only
    available_agents: list[Literal["schedule_agent", "itinerary_agent", "concierge_agent"]] | None = None


app = create_app()


def main():
    port = int(os.environ.get("NOA_API_PORT", 8000))
    host = os.environ.get("NOA_API_HOST", "0.0.0.0")
    uvicorn.run(app, host=host, port=port, timeout_keep_alive=3600)


if __name__ == "__main__":
    main()
