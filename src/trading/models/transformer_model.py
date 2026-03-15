"""Transformer encoder model for price direction prediction.

Architecture: Sinusoidal positional encoding -> 4-head attention ->
FFN(128) -> 2 encoder layers -> Dropout(0.1) -> Global avg pooling ->
Classification/regression head.
"""

from __future__ import annotations

import logging
import math

import torch
import torch.nn as nn

from config.settings import LOG_FORMAT

logging.basicConfig(format=LOG_FORMAT)
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


class PositionalEncoding(nn.Module):
    """Sinusoidal positional encoding for transformer input."""

    def __init__(self, d_model: int, max_len: int = 500, dropout: float = 0.1) -> None:
        super().__init__()
        self.dropout = nn.Dropout(dropout)

        pe = torch.zeros(max_len, d_model)
        position = torch.arange(0, max_len, dtype=torch.float).unsqueeze(1)
        div_term = torch.exp(torch.arange(0, d_model, 2).float() * (-math.log(10000.0) / d_model))
        pe[:, 0::2] = torch.sin(position * div_term)
        if d_model % 2 == 0:
            pe[:, 1::2] = torch.cos(position * div_term)
        else:
            pe[:, 1::2] = torch.cos(position * div_term[:-1])
        pe = pe.unsqueeze(0)  # (1, max_len, d_model)
        self.register_buffer("pe", pe)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = x + self.pe[:, : x.size(1)]
        return self.dropout(x)


class TransformerPredictor(nn.Module):
    """Transformer encoder for time-series classification/regression."""

    def __init__(
        self,
        input_size: int,
        d_model: int = 64,
        nhead: int = 4,
        num_layers: int = 2,
        dim_feedforward: int = 128,
        dropout: float = 0.1,
        num_classes: int = 3,
        mode: str = "classification",
        max_len: int = 500,
    ) -> None:
        super().__init__()
        self.mode = mode

        self.input_projection = nn.Linear(input_size, d_model)
        self.pos_encoder = PositionalEncoding(d_model, max_len=max_len, dropout=dropout)

        encoder_layer = nn.TransformerEncoderLayer(
            d_model=d_model,
            nhead=nhead,
            dim_feedforward=dim_feedforward,
            dropout=dropout,
            batch_first=True,
        )
        self.transformer_encoder = nn.TransformerEncoder(
            encoder_layer, num_layers=num_layers,
        )

        self.dropout = nn.Dropout(dropout)

        if mode == "classification":
            self.fc_out = nn.Linear(d_model, num_classes)
        else:
            self.fc_out = nn.Linear(d_model, 1)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """Forward pass. x shape: (batch, window, features)."""
        x = self.input_projection(x)
        x = self.pos_encoder(x)
        x = self.transformer_encoder(x)

        # Global average pooling over the sequence dimension
        x = x.mean(dim=1)
        x = self.dropout(x)
        x = self.fc_out(x)

        if self.mode == "regression":
            x = x.squeeze(-1)

        return x


def create_transformer_model(
    input_size: int,
    d_model: int = 64,
    nhead: int = 4,
    num_layers: int = 2,
    dim_feedforward: int = 128,
    dropout: float = 0.1,
    num_classes: int = 3,
    mode: str = "classification",
    learning_rate: float = 0.001,
    device: str = "cpu",
) -> tuple[TransformerPredictor, torch.optim.Adam, torch.optim.lr_scheduler.ReduceLROnPlateau]:
    """Create a Transformer model with optimizer and scheduler."""
    model = TransformerPredictor(
        input_size=input_size,
        d_model=d_model,
        nhead=nhead,
        num_layers=num_layers,
        dim_feedforward=dim_feedforward,
        dropout=dropout,
        num_classes=num_classes,
        mode=mode,
    ).to(device)

    optimizer = torch.optim.Adam(model.parameters(), lr=learning_rate)
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(
        optimizer, mode="min", patience=5, factor=0.5,
    )

    param_count = sum(p.numel() for p in model.parameters())
    logger.info("Transformer model created: %d parameters, device=%s", param_count, device)

    return model, optimizer, scheduler
