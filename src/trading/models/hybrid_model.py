"""Hybrid LSTM-Transformer model combining sequential and attention-based processing.

Based on IEEE 2024 research: LSTM branch for sequential dependencies,
Transformer branch for long-range attention, concatenated with a Dense
fusion layer.
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


class HybridLSTMTransformer(nn.Module):
    """Primary prediction model: LSTM + Transformer parallel branches with fusion."""

    def __init__(
        self,
        input_size: int,
        lstm_hidden: int = 64,
        d_model: int = 64,
        nhead: int = 4,
        num_transformer_layers: int = 2,
        dim_feedforward: int = 128,
        dropout: float = 0.2,
        num_classes: int = 3,
        mode: str = "classification",
    ) -> None:
        super().__init__()
        self.mode = mode

        # LSTM branch
        self.lstm = nn.LSTM(
            input_size=input_size,
            hidden_size=lstm_hidden,
            num_layers=2,
            batch_first=True,
            dropout=dropout,
        )
        self.lstm_dropout = nn.Dropout(dropout)

        # Transformer branch
        self.input_projection = nn.Linear(input_size, d_model)
        pe = torch.zeros(500, d_model)
        position = torch.arange(0, 500, dtype=torch.float).unsqueeze(1)
        div_term = torch.exp(torch.arange(0, d_model, 2).float() * (-math.log(10000.0) / d_model))
        pe[:, 0::2] = torch.sin(position * div_term)
        if d_model % 2 == 0:
            pe[:, 1::2] = torch.cos(position * div_term)
        else:
            pe[:, 1::2] = torch.cos(position * div_term[:-1])
        self.register_buffer("pe", pe.unsqueeze(0))

        encoder_layer = nn.TransformerEncoderLayer(
            d_model=d_model,
            nhead=nhead,
            dim_feedforward=dim_feedforward,
            dropout=dropout,
            batch_first=True,
        )
        self.transformer = nn.TransformerEncoder(
            encoder_layer, num_layers=num_transformer_layers,
        )
        self.transformer_dropout = nn.Dropout(dropout)

        # Fusion layer
        fusion_input = lstm_hidden + d_model
        self.fusion = nn.Sequential(
            nn.Linear(fusion_input, 64),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(64, 32),
            nn.ReLU(),
        )

        if mode == "classification":
            self.output_head = nn.Linear(32, num_classes)
        else:
            self.output_head = nn.Linear(32, 1)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """Forward pass. x shape: (batch, window, features)."""
        # LSTM branch
        lstm_out, _ = self.lstm(x)
        lstm_out = self.lstm_dropout(lstm_out[:, -1, :])

        # Transformer branch
        t_input = self.input_projection(x)
        t_input = t_input + self.pe[:, : t_input.size(1)]
        t_out = self.transformer(t_input)
        t_out = self.transformer_dropout(t_out.mean(dim=1))

        # Concatenate and fuse
        combined = torch.cat([lstm_out, t_out], dim=-1)
        fused = self.fusion(combined)
        out = self.output_head(fused)

        if self.mode == "regression":
            out = out.squeeze(-1)

        return out


def create_hybrid_model(
    input_size: int,
    lstm_hidden: int = 64,
    d_model: int = 64,
    nhead: int = 4,
    num_transformer_layers: int = 2,
    dim_feedforward: int = 128,
    dropout: float = 0.2,
    num_classes: int = 3,
    mode: str = "classification",
    learning_rate: float = 0.001,
    device: str = "cpu",
) -> tuple[HybridLSTMTransformer, torch.optim.Adam, torch.optim.lr_scheduler.ReduceLROnPlateau]:
    """Create a Hybrid LSTM-Transformer model with optimizer and scheduler."""
    model = HybridLSTMTransformer(
        input_size=input_size,
        lstm_hidden=lstm_hidden,
        d_model=d_model,
        nhead=nhead,
        num_transformer_layers=num_transformer_layers,
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
    logger.info("Hybrid LSTM-Transformer model created: %d parameters, device=%s", param_count, device)

    return model, optimizer, scheduler
