"""LSTM model for price direction prediction.

Architecture: Input(window x features) -> LSTM(64) -> Dropout(0.2) ->
LSTM(32) -> Dropout(0.2) -> Dense(16, ReLU) -> Dense(3, Softmax) for
classification or Dense(1) for regression.
"""

from __future__ import annotations

import logging

import torch
import torch.nn as nn

from config.settings import LOG_FORMAT

logging.basicConfig(format=LOG_FORMAT)
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


class LSTMPredictor(nn.Module):
    """LSTM-based price direction classifier/regressor."""

    def __init__(
        self,
        input_size: int,
        hidden_size_1: int = 64,
        hidden_size_2: int = 32,
        dropout: float = 0.2,
        num_classes: int = 3,
        mode: str = "classification",
    ) -> None:
        super().__init__()
        self.mode = mode

        self.lstm1 = nn.LSTM(
            input_size=input_size,
            hidden_size=hidden_size_1,
            batch_first=True,
            num_layers=1,
        )
        self.dropout1 = nn.Dropout(dropout)

        self.lstm2 = nn.LSTM(
            input_size=hidden_size_1,
            hidden_size=hidden_size_2,
            batch_first=True,
            num_layers=1,
        )
        self.dropout2 = nn.Dropout(dropout)

        self.fc1 = nn.Linear(hidden_size_2, 16)
        self.relu = nn.ReLU()

        if mode == "classification":
            self.fc_out = nn.Linear(16, num_classes)
        else:
            self.fc_out = nn.Linear(16, 1)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """Forward pass. x shape: (batch, window, features)."""
        out, _ = self.lstm1(x)
        out = self.dropout1(out)

        out, _ = self.lstm2(out)
        out = self.dropout2(out)

        # Take the last timestep
        out = out[:, -1, :]

        out = self.relu(self.fc1(out))
        out = self.fc_out(out)

        if self.mode == "regression":
            out = out.squeeze(-1)

        return out


def create_lstm_model(
    input_size: int,
    hidden_size_1: int = 64,
    hidden_size_2: int = 32,
    dropout: float = 0.2,
    num_classes: int = 3,
    mode: str = "classification",
    learning_rate: float = 0.001,
    device: str = "cpu",
) -> tuple[LSTMPredictor, torch.optim.Adam, torch.optim.lr_scheduler.ReduceLROnPlateau]:
    """Create an LSTM model with optimizer and scheduler."""
    model = LSTMPredictor(
        input_size=input_size,
        hidden_size_1=hidden_size_1,
        hidden_size_2=hidden_size_2,
        dropout=dropout,
        num_classes=num_classes,
        mode=mode,
    ).to(device)

    optimizer = torch.optim.Adam(model.parameters(), lr=learning_rate)
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(
        optimizer, mode="min", patience=5, factor=0.5,
    )

    param_count = sum(p.numel() for p in model.parameters())
    logger.info("LSTM model created: %d parameters, device=%s", param_count, device)

    return model, optimizer, scheduler
