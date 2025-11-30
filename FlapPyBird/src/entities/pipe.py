import random
from typing import List

from ..utils import GameConfig
from .entity import Entity


class Pipe(Entity):
    def __init__(self, *args, **kwargs) -> None:
        super().__init__(*args, **kwargs)
        self.vel_x = -5

    def draw(self) -> None:
        self.x += self.vel_x
        super().draw()


class Pipes(Entity):
    upper: List[Pipe]
    lower: List[Pipe]

    def __init__(self, config: GameConfig) -> None:
        super().__init__(config)
        self.pipe_gap = 120
        self.top = 0
        self.bottom = self.config.window.viewport_height
        self.upper = []
        self.lower = []
        self.spawn_initial_pipes()

    def tick(self) -> None:
        if self.can_spawn_pipes():
            self.spawn_new_pipes()
        self.remove_old_pipes()

        # Apply random piecewise-constant vertical motion to gap center if enabled.
        # Each pipe pair maintains its own random velocity and duration so that
        # gaps move unpredictably but stay within the viewport bounds.
        if getattr(self.config, "moving_gaps", False):
            fps = max(1, int(getattr(self.config, "fps", 30)))

            # Derive typical speeds / change rates from config knobs.
            freq_hz = float(getattr(self.config, "gap_freq_hz", 0.5) or 0.5)
            amp_px = float(getattr(self.config, "gap_amp_px", 20.0))

            # Approximate peak speed similar to sinusoid: v_peak ≈ 2π A f,
            # but keep it modest for learning stability.
            approx_peak_speed = (2 * 3.141592653589793 * amp_px * freq_hz) / fps
            max_speed = max(0.3, approx_peak_speed)
            min_speed = 0.5 * max_speed

            # Segment duration in seconds: around 1 / freq_hz, but clamped.
            mean_sec = 1.0 / max(0.1, freq_hz)
            min_sec = max(0.2, 0.3 * mean_sec)
            max_sec = min(2.0, 1.7 * mean_sec)

            min_frames = max(1, int(min_sec * fps))
            max_frames = max(min_frames, int(max_sec * fps))

            # Bounds to keep gap within viewport
            min_center = self.pipe_gap / 2 + 5
            max_center = (
                self.config.window.viewport_height - self.pipe_gap / 2 - 5
            )
            pipe_height = self.config.images.pipe[0].get_height()

            for up_pipe, low_pipe in zip(self.upper, self.lower):
                # If this pipe pair is owned by a frontend player (web eval),
                # don't apply random vertical motion here. The server will
                # position these pipes directly based on user input.
                if getattr(up_pipe, "ownerUserId", None):
                    continue

                # Initialize per-pair state on first use
                center = getattr(up_pipe, "gap_center_y", None)
                if center is None:
                    center = low_pipe.y - self.pipe_gap / 2
                    up_pipe.gap_center_y = center
                    low_pipe.gap_center_y = center
                    up_pipe.gap_vel_y = 0.0
                    low_pipe.gap_vel_y = 0.0
                    up_pipe.gap_time_left = 0
                    low_pipe.gap_time_left = 0

                vel_y = float(getattr(up_pipe, "gap_vel_y", 0.0))
                time_left = int(getattr(up_pipe, "gap_time_left", 0))

                # Pick a new random velocity segment when time runs out
                if time_left <= 0 or abs(vel_y) < 1e-6:
                    duration_frames = random.randint(min_frames, max_frames)
                    speed = random.uniform(min_speed, max_speed)
                    direction = random.choice([-1.0, 1.0])
                    vel_y = direction * speed
                    time_left = duration_frames

                # Move center
                center += vel_y

                # Bounce off top/bottom bounds and re-randomize duration
                if center < min_center:
                    center = min_center
                    vel_y = abs(vel_y)  # force downward
                    time_left = random.randint(min_frames, max_frames)
                elif center > max_center:
                    center = max_center
                    vel_y = -abs(vel_y)  # force upward
                    time_left = random.randint(min_frames, max_frames)

                time_left -= 1

                # Persist per-pair state on both pipes so env can inspect it if needed
                up_pipe.gap_center_y = center
                low_pipe.gap_center_y = center
                up_pipe.gap_vel_y = vel_y
                low_pipe.gap_vel_y = vel_y
                up_pipe.gap_time_left = time_left
                low_pipe.gap_time_left = time_left

                # Apply to actual sprite positions
                up_pipe.y = center - self.pipe_gap / 2 - pipe_height
                low_pipe.y = center + self.pipe_gap / 2

        for up_pipe, low_pipe in zip(self.upper, self.lower):
            up_pipe.tick()
            low_pipe.tick()

    def stop(self) -> None:
        for pipe in self.upper + self.lower:
            pipe.vel_x = 0

    def can_spawn_pipes(self) -> bool:
        last = self.upper[-1]
        if not last:
            return True

        return self.config.window.width - (last.x + last.w) > last.w * 2.5

    def spawn_new_pipes(self):
        # add new pipe when first pipe is about to touch left of screen
        upper, lower = self.make_random_pipes()
        self.upper.append(upper)
        self.lower.append(lower)

    def remove_old_pipes(self):
        # remove first pipe if its out of the screen
        for pipe in self.upper:
            if pipe.x < -pipe.w:
                self.upper.remove(pipe)

        for pipe in self.lower:
            if pipe.x < -pipe.w:
                self.lower.remove(pipe)

    def spawn_initial_pipes(self):
        upper_1, lower_1 = self.make_random_pipes()
        upper_1.x = self.config.window.width + upper_1.w * 3
        lower_1.x = self.config.window.width + upper_1.w * 3
        self.upper.append(upper_1)
        self.lower.append(lower_1)

        upper_2, lower_2 = self.make_random_pipes()
        upper_2.x = upper_1.x + upper_1.w * 3.5
        lower_2.x = upper_1.x + upper_1.w * 3.5
        self.upper.append(upper_2)
        self.lower.append(lower_2)

    def make_random_pipes(self):
        """returns a randomly generated pipe"""
        # y of gap between upper and lower pipe
        base_y = self.config.window.viewport_height

        gap_y = random.randrange(0, int(base_y * 0.6 - self.pipe_gap))
        gap_y += int(base_y * 0.2)
        pipe_height = self.config.images.pipe[0].get_height()
        pipe_x = self.config.window.width + 10

        upper_pipe = Pipe(
            self.config,
            self.config.images.pipe[0],
            pipe_x,
            gap_y - pipe_height,
        )

        lower_pipe = Pipe(
            self.config,
            self.config.images.pipe[1],
            pipe_x,
            gap_y + self.pipe_gap,
        )

        return upper_pipe, lower_pipe
