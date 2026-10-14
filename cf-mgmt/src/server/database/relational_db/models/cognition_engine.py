# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

"""Cognition Engine database model"""

from datetime import datetime, timezone

from sqlalchemy import TIMESTAMP, Boolean, Column, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import JSONB

from server.database.relational_db.models import Base


class CognitionEngine(Base):
    """Cognition Engine model - CFN-scoped cognition processing engine"""

    __tablename__ = "cognition_engine"

    id = Column(String(255), primary_key=True, nullable=False)
    cfn_id = Column(String(255), ForeignKey("cognition_fabric_node.id"), nullable=False, index=True)

    # CE identity (unique constraint on cfn_id + name + version)
    name = Column(String(255), nullable=False)
    version = Column(String(50), nullable=False)

    # CE type: CASA or DETECTIVE
    ce_type = Column(String(20), nullable=False)

    # Connection info
    base_url = Column(String(512), nullable=False)  # Base URL (e.g., http://casa-ce:8080)
    endpoint = Column(String(255), nullable=False)  # API endpoint path (e.g., /api/l9/enforcement)
    health_url = Column(String(512), nullable=False)  # Full URL CFN probes with GET (e.g., http://casa-ce:8080/healthz)

    # Lifecycle
    enabled = Column(Boolean, nullable=False, default=True)
    mas_auto_associate = Column(Boolean, nullable=False, default=False)

    # Status
    status = Column(String(20), nullable=False, default="offline")
    last_seen = Column(TIMESTAMP(timezone=True), nullable=True)  # Last successful health probe

    # Configuration
    mas_config = Column(JSONB, nullable=True, default=dict)

    # Audit fields
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(TIMESTAMP(timezone=True), nullable=True, onupdate=func.now())
    deleted_at = Column(TIMESTAMP(timezone=True), nullable=True)
    created_by = Column(String(36), nullable=True)
    updated_by = Column(String(36), nullable=True)

    def __repr__(self):
        return (
            f"<CognitionEngine(id={self.id}, cfn_id={self.cfn_id}, "
            f"name={self.name}, version={self.version}, ce_type={self.ce_type})>"
        )
