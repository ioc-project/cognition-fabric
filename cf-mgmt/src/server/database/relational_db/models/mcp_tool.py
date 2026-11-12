# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

"""MCP Tool database model - stores tool definitions for MCP servers"""

from sqlalchemy import Column, String, DateTime, Text, text, Index, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB

from server.database.relational_db.models import Base


class MCPTool(Base):
    __tablename__ = "mcp_tool"

    id = Column(String(255), primary_key=True)
    mcp_server_id = Column(String(255), ForeignKey("mcp_server.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    parameters = Column(JSONB, nullable=True)  # JSON Schema for tool parameters
    definition = Column(JSONB, nullable=True)
    source_snapshot = Column(JSONB, nullable=True)
    provenance = Column(JSONB, nullable=True)
    protocol_version = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))
    updated_at = Column(DateTime(timezone=True), nullable=True, server_default=text("CURRENT_TIMESTAMP"))

    __table_args__ = (
        Index("idx_mcp_tool_server_id", "mcp_server_id"),
        UniqueConstraint("mcp_server_id", "name", name="uq_mcp_tool_server_name"),
    )

    def __repr__(self):
        return f"<MCPTool(id='{self.id}', name='{self.name}', mcp_server_id='{self.mcp_server_id}')>"
