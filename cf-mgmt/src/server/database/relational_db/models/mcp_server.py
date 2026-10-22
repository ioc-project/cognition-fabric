# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

"""MCP Server database model - stores MCP server definitions for MAS"""

from sqlalchemy import Column, String, DateTime, Text, text, Index, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB

from server.database.relational_db.models import Base


class MCPServer(Base):
    __tablename__ = "mcp_server"

    id = Column(String(255), primary_key=True)
    mas_id = Column(String(36), ForeignKey("multi_agentic_system.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    transport = Column(String(50), nullable=True)  # e.g., "stdio", "sse"
    description = Column(Text, nullable=True)
    config = Column(JSONB, nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=text("CURRENT_TIMESTAMP"))
    updated_at = Column(DateTime, nullable=True, server_default=text("CURRENT_TIMESTAMP"))

    __table_args__ = (
        Index("idx_mcp_server_mas_id", "mas_id"),
        UniqueConstraint("mas_id", "name", name="uq_mcp_server_mas_name"),
    )

    def __repr__(self):
        return f"<MCPServer(id='{self.id}', name='{self.name}', mas_id='{self.mas_id}')>"
