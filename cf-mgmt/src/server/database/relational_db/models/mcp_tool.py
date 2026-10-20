# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

"""MCP Tool database model - stores tool definitions for MCP servers"""

from sqlalchemy import Column, String, DateTime, Text, text, Index, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB

from server.database.relational_db.models import Base


class MCPTool(Base):
    __tablename__ = "mcp_tool"

    id = Column(String(255), primary_key=True)
    mcp_server_id = Column(String(255), ForeignKey("mcp_server.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    parameters = Column(JSONB, nullable=True)  # JSON Schema for tool parameters
    created_at = Column(DateTime, nullable=False, server_default=text("CURRENT_TIMESTAMP"))
    updated_at = Column(DateTime, nullable=True, server_default=text("CURRENT_TIMESTAMP"))

    __table_args__ = (
        Index("idx_mcp_tool_server_id", "mcp_server_id"),
    )

    def __repr__(self):
        return f"<MCPTool(id='{self.id}', name='{self.name}', mcp_server_id='{self.mcp_server_id}')>"
