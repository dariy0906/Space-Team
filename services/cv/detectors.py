"""Temporal heuristics, not a medical diagnosis or a trained fall classifier."""
from dataclasses import dataclass
from typing import Protocol
import math

@dataclass
class Observation:
    at: float
    hip_x: float
    hip_y: float
    shoulder_x: float
    shoulder_y: float
    width: float
    height: float
    visibility: float

class Detector(Protocol):
    def update(self, observation: Observation) -> dict | None: ...

class FallDetector:
    def __init__(self, timeout: float = 8, require_drop: bool = False):
        self.timeout = timeout
        # require_drop=True — дополнительно требовать смещения бёдер вниз относительно стойки.
        # По умолчанию выключено: критерий зависит от кадрирования камеры и ломает детекцию
        # при изменении ориентации в фиксированном кадре. Основной сигнал — смена ориентации
        # «вертикально → горизонтально» с выдержкой. См. DetectionPipeline.
        self.require_drop = require_drop
        self.standing_at = None
        self.standing_y = None
        self.down_since = None
        self.previous = None
        self.triggered = False

    def reset(self):
        self.standing_at = self.standing_y = self.down_since = self.previous = None
        self.triggered = False

    def update(self, o: Observation) -> dict | None:
        if o.visibility < .65:
            self.reset()
            return None
        if self.previous and o.at - self.previous.at > 2.5:
            self.reset()
        # Ориентация оценивается по оси «плечи → бёдра», а не по габаритному прямоугольнику:
        # у стоящего человека с широко расставленными ногами bbox-соотношение ненадёжно.
        dx, dy = abs(o.shoulder_x-o.hip_x), abs(o.shoulder_y-o.hip_y)
        horizontal = dx > dy * 1.2
        upright = dy > dx * 1.5
        if upright:
            self.standing_at, self.standing_y = o.at, o.hip_y
            self.down_since = None
            self.triggered = False
        elif horizontal and self.standing_at is not None:
            if self.down_since is None:
                if o.at - self.standing_at <= 2.5 and (not self.require_drop or o.hip_y > self.standing_y + .08):
                    self.down_since = o.at
                else:
                    self.standing_at = None
            elif self.previous and math.hypot(o.hip_x-self.previous.hip_x,o.hip_y-self.previous.hip_y) > .04:
                self.down_since = o.at
            if self.down_since is not None and o.at-self.down_since >= self.timeout and not self.triggered:
                self.triggered = True
                self.previous = o
                dwell = o.at - self.down_since
                drop = max(0.0, o.hip_y - (self.standing_y or o.hip_y))
                # Это эвристический detection score (0-100), НЕ калиброванная вероятность падения.
                # Состав: длительность лежания, величина смещения бёдер вниз, уверенность позы.
                score = round(min(99, 40 + 20*min(1, dwell/max(1,self.timeout)) + 25*min(1, drop/0.3) + 15*max(0, (o.visibility-0.65)/0.35)))
                return {"type":"PERSON_FALL","confidence":score,"score":score,"poseVisibility":round(o.visibility*100),"durationSeconds":round(dwell),"method":"pose-temporal-heuristic"}
        else:
            self.down_since = None
        self.previous = o
        return None

class FightDetector:
    """EXPERIMENTAL temporal heuristic. Not a trained action-recognition model.

    Never infers a fight from a single frame: it requires >=2 tracked people with sustained
    high motion energy over a time window. Replaceable via the same ``update`` interface with a
    licensed temporal action model. Disabled unless explicitly enabled.
    """
    def __init__(self, enabled: bool = False, min_people: int = 2, min_duration: float = 2.0, threshold: float = 0.06):
        self.enabled = enabled
        self.min_people = min_people
        self.min_duration = min_duration
        self.threshold = threshold
        self.previous: dict = {}
        self.active_since = None

    def reset(self):
        self.previous = {}
        self.active_since = None

    def update(self, observations: list[Observation] | None, at: float) -> dict | None:
        if not self.enabled or not observations or len(observations) < self.min_people:
            self.reset()
            return None
        # Nearest-neighbour matching to the previous frame gives a crude per-person displacement.
        energy = 0.0
        for o in observations:
            best = None
            best_d = float("inf")
            for key in self.previous:
                d = (key[0] - o.hip_x) ** 2 + (key[1] - o.hip_y) ** 2
                if d < best_d:
                    best_d, best = d, key
            if best is not None and best_d < 0.05:
                p = self.previous[best]
                energy = max(energy, math.hypot(o.shoulder_x - p["sx"], o.shoulder_y - p["sy"]) + math.hypot(o.hip_x - p["hx"], o.hip_y - p["hy"]))
        self.previous = {(o.hip_x, o.hip_y): {"sx": o.shoulder_x, "sy": o.shoulder_y, "hx": o.hip_x, "hy": o.hip_y} for o in observations}
        if energy >= self.threshold:
            if self.active_since is None:
                self.active_since = at
        else:
            self.active_since = None
        if self.active_since is not None and at - self.active_since >= self.min_duration:
            duration = at - self.active_since
            score = round(min(95, 40 + 30 * min(1, duration / self.min_duration) + 20 * min(1, energy / (self.threshold * 2)) + 10 * min(1, len(observations) - 1)))
            self.active_since = None
            return {"type": "POSSIBLE_FIGHT", "score": score, "confidence": score, "peopleCount": len(observations), "durationSeconds": round(duration, 1), "method": "pose-motion-temporal-heuristic", "experimental": True}
        return None

class DetectionPipeline:
    def __init__(self, timeout: float, enable_fight: bool = False):
        self.fall = FallDetector(timeout)
        self.fight = FightDetector(enabled=enable_fight)
    def update(self, observation: Observation | None) -> list[dict]:
        if observation is None:
            self.fall.reset()
            return []
        result = self.fall.update(observation)
        return [result] if result else []
    def update_fight(self, observations: list[Observation] | None, at: float) -> list[dict]:
        result = self.fight.update(observations, at)
        return [result] if result else []

