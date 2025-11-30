from dataclasses import dataclass
from typing import Optional

import numpy as np
import torch
from torch import nn
from torch.optim import Adam

from .q_network import QNetwork


@dataclass
class DQNConfig:
    state_dim: int = 6
    action_dim: int = 2
    gamma: float = 0.99
    lr: float = 1e-3
    batch_size: int = 64
    target_update_every: int = 1_000
    eps_start: float = 1.0
    eps_end: float = 0.05
    eps_decay_steps: int = 200_000
    grad_clip: float = 5.0
    device: str = "cpu"


class DQNAgent:
    def __init__(self, cfg: DQNConfig) -> None:
        # Store the configuration (hyperparameters) for later use
        self.cfg = cfg
        # Create a PyTorch device object (CPU, GPU, or MPS for Apple Silicon)
        self.device = torch.device(cfg.device)

        # Create the main Q-network: this neural network learns to predict Q-values (action values)
        self.q = QNetwork(cfg.state_dim, cfg.action_dim).to(self.device)
        # Create a copy called "target network": used for stable learning (updated less frequently)
        self.target = QNetwork(cfg.state_dim, cfg.action_dim).to(self.device)
        # Copy weights from main network to target network (start them identical)
        self.target.load_state_dict(self.q.state_dict())
        # Set target network to evaluation mode (no gradient computation needed for it)
        self.target.eval()

        # Create optimizer: Adam optimizer updates the Q-network weights during training
        self.opt = Adam(self.q.parameters(), lr=cfg.lr)

        # Track how many steps the agent has taken (used for epsilon decay)
        self.steps = 0
        # Initialize epsilon (exploration rate): starts high, decays over time
        self.eps = cfg.eps_start

    def epsilon_greedy(self, state_np: np.ndarray) -> int:
        # Increment step counter (used to track training progress)
        self.steps += 1
        # Update epsilon value (gradually reduce exploration over time)
        self._update_epsilon()

        # With probability 'eps', choose a random action (exploration)
        if np.random.random() < self.eps:
            # Return a random action (0 or 1 for Flappy Bird: do nothing or flap)
            return int(np.random.randint(0, self.cfg.action_dim))

        # Otherwise, use the Q-network to choose the best action (exploitation)
        # Convert numpy array to PyTorch tensor and add batch dimension
        state = torch.from_numpy(state_np).float().unsqueeze(0).to(self.device)
        # Don't compute gradients here (we're just getting predictions, not training)
        with torch.no_grad():
            # Get Q-values for all actions in this state
            q_values = self.q(state)
            # Choose the action with the highest Q-value (best predicted value)
            action = int(torch.argmax(q_values, dim=-1).item())
        return action

    def _update_epsilon(self) -> None:
        # Linear decay: gradually reduce exploration rate over time
        # Calculate what fraction of decay period we've completed (0.0 to 1.0)
        frac = min(1.0, self.steps / float(self.cfg.eps_decay_steps))
        # Linearly interpolate between start and end epsilon values
        self.eps = self.cfg.eps_start + frac * (self.cfg.eps_end - self.cfg.eps_start)

    def optimize(self, batch: dict) -> float:
        # Convert batch data from numpy arrays to PyTorch tensors
        # Extract states from the batch
        state = torch.from_numpy(batch["state"]).float().to(self.device)
        # Extract actions taken in those states
        action = torch.from_numpy(batch["action"]).long().to(self.device)
        # Extract rewards received
        reward = torch.from_numpy(batch["reward"]).float().to(self.device)
        # Extract next states (states we ended up in after taking actions)
        next_state = torch.from_numpy(batch["next_state"]).float().to(self.device)
        # Extract done flags (whether episode ended)
        done = torch.from_numpy(batch["done"]).float().to(self.device)

        # Q(s,a): Get the Q-value that our network predicted for the action we actually took
        q = self.q(state).gather(1, action)

        # Calculate target Q-value using target network (more stable than using main network)
        with torch.no_grad():
            # Get maximum Q-value from next state (best action's value)
            q_next = self.target(next_state).max(dim=1, keepdim=True)[0]
            # Bellman equation: target = immediate reward + discounted future reward (if not done)
            target = reward + (1.0 - done) * self.cfg.gamma * q_next

        # Calculate loss: how wrong was our prediction compared to the target?
        loss = nn.functional.smooth_l1_loss(q, target)

        # Clear previous gradients before computing new ones
        self.opt.zero_grad(set_to_none=True)
        # Backpropagate: compute gradients (how to adjust weights to reduce loss)
        loss.backward()
        # Clip gradients to prevent them from becoming too large (stability)
        nn.utils.clip_grad_norm_(self.q.parameters(), self.cfg.grad_clip)
        # Update network weights using computed gradients
        self.opt.step()

        # Periodically update target network: copy weights from main network to target network
        if self.steps % self.cfg.target_update_every == 0:
            # Copy all weights from Q-network to target network
            self.target.load_state_dict(self.q.state_dict())

        # Return the loss value (for logging/monitoring)
        return float(loss.item())

    def save(self, path: str, extra: Optional[dict] = None) -> None:
        # Save the agent's state to a file (checkpoint)
        data = {
            # Save Q-network weights
            "q": self.q.state_dict(),
            # Save target network weights
            "target": self.target.state_dict(),
            # Save optimizer state (for resuming training)
            "opt": self.opt.state_dict(),
            # Save step counter
            "steps": self.steps,
            # Save current epsilon value
            "eps": self.eps,
            # Save configuration (hyperparameters)
            "cfg": self.cfg.__dict__,
        }
        # Allow caller to attach additional metadata (e.g., ma50, best_ma)
        if extra:
            data.update(extra)
        torch.save(data, path)

    def load(self, path: str, map_location: Optional[str] = None) -> None:
        # Load a previously saved checkpoint from file
        ckpt = torch.load(path, map_location=map_location or self.device)
        # Restore Q-network weights
        self.q.load_state_dict(ckpt["q"])
        # Restore target network weights
        self.target.load_state_dict(ckpt["target"])
        # Restore optimizer state (allows resuming training smoothly)
        self.opt.load_state_dict(ckpt["opt"])
        # Restore step counter (or default to 0 if not found)
        self.steps = ckpt.get("steps", 0)
        # Restore epsilon value (or default to start value if not found)
        self.eps = ckpt.get("eps", self.cfg.eps_start)


