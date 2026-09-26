"""Temporal heuristics, not a medical diagnosis or a trained fall classifier."""
from dataclasses import dataclass
from typing import Protocol
import math
import numpy as np

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



class RoadDamageDetector:
    """Классический CV-детектор повреждений дорожного покрытия. Это не нейросеть.

    Ищет в нижней части кадра — там, где у дорожной камеры проезжая часть, — компактные
    тёмные области с резкой границей. Так на фото выглядит яма или выбоина: тень внутри
    углубления, часто с водой. Тени от машин и деревьев обычно крупнее и мягче по краю,
    разметка светлая, поэтому такие области отсекаются. Детектор отдаёт кандидатов с
    эвристической оценкой; окончательное решение принимает оператор.

    Интерфейс detect(rgb) -> list[dict] сохраняется, если заменить детектор обученной моделью.
    """

    name = "road-damage-heuristic-v1"

    def __init__(self, min_score: float = 55.0, work_width: int = 320, roi_top: float = 0.45):
        self.min_score = min_score
        self.work_width = work_width
        self.roi_top = roi_top

    @staticmethod
    def _downscale(rgb: np.ndarray, width: int) -> tuple[np.ndarray, int]:
        h, w = rgb.shape[:2]
        f = max(1, int(np.ceil(w / width)))
        hh, ww = (h // f) * f, (w // f) * f
        small = rgb[:hh, :ww].reshape(hh // f, f, ww // f, f, rgb.shape[2]).mean(axis=(1, 3))
        return small, f

    @staticmethod
    def _majority(mask: np.ndarray, k: int = 3) -> np.ndarray:
        # Сглаживание маски окном k×k через интегральное изображение: убирает одиночный шум.
        pad = k // 2
        p = np.pad(mask.astype(np.int32), pad, mode="edge")
        ii = np.pad(p.cumsum(0).cumsum(1), ((1, 0), (1, 0)))
        s = ii[k:, k:] - ii[:-k, k:] - ii[k:, :-k] + ii[:-k, :-k]
        return s > (k * k) // 2

    @staticmethod
    def _components(mask: np.ndarray) -> list[np.ndarray]:
        # Связные области (4-соседство). Обходим только тёмные пиксели, их немного.
        h, w = mask.shape
        seen = np.zeros_like(mask, dtype=bool)
        found = []
        for start in zip(*np.nonzero(mask)):
            if seen[start]:
                continue
            stack, pixels = [start], []
            seen[start] = True
            while stack:
                y, x = stack.pop()
                pixels.append((y, x))
                for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                    if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        stack.append((ny, nx))
            found.append(np.array(pixels))
        return found

    def detect(self, rgb: np.ndarray) -> list[dict]:
        if rgb.ndim != 3 or rgb.shape[0] < 32 or rgb.shape[1] < 32:
            return []
        small, f = self._downscale(rgb.astype(np.float32), self.work_width)
        gray = small[..., 0] * 0.299 + small[..., 1] * 0.587 + small[..., 2] * 0.114
        H, W = gray.shape
        y0, x0, x1 = int(H * self.roi_top), int(W * 0.05), int(W * 0.95)
        roi = gray[y0:, x0:x1]
        med = float(np.median(roi))
        mad = float(np.median(np.abs(roi - med))) * 1.4826 + 1e-6
        # Тёмное относительно самой дороги в этом кадре — порог адаптируется к освещению.
        mask = self._majority(roi < min(med - 2.2 * mad, med * 0.75))
        gy, gx = np.gradient(roi)
        grad = np.hypot(gx, gy)
        road_grad = float(np.median(grad)) + 1.0
        roi_area = roi.size

        detections = []
        for comp in self._components(mask):
            ratio = len(comp) / roi_area
            if ratio < 0.002 or ratio > 0.18:
                continue
            ys, xs = comp[:, 0], comp[:, 1]
            by0, by1, bx0, bx1 = ys.min(), ys.max(), xs.min(), xs.max()
            bw, bh = bx1 - bx0 + 1, by1 - by0 + 1
            fill = len(comp) / float(bw * bh)
            aspect = bw / float(bh)
            if fill < 0.3 or aspect > 6 or aspect < 0.25:
                continue
            # Граница области — пиксели, у которых есть сосед вне области.
            inside = np.zeros(roi.shape, dtype=bool)
            inside[ys, xs] = True
            interior = inside.copy()
            interior[1:, :] &= inside[:-1, :]
            interior[:-1, :] &= inside[1:, :]
            interior[:, 1:] &= inside[:, :-1]
            interior[:, :-1] &= inside[:, 1:]
            boundary = inside & ~interior
            edge_ratio = float(grad[boundary].mean()) / road_grad if boundary.any() else 0.0

            darkness = min(1.0, max(0.0, (med - float(roi[ys, xs].mean())) / (0.5 * med + 1e-6)))
            edge = min(1.0, max(0.0, (edge_ratio - 1.0) / 3.0))
            shape = max(0.0, 1.0 - abs(fill - 0.72) / 0.45)
            size = 1.0 if 0.005 <= ratio <= 0.08 else 0.5
            score = round(100 * (0.4 * darkness + 0.3 * edge + 0.15 * shape + 0.15 * size), 1)
            if score < self.min_score:
                continue

            # Координаты рамки — в долях исходного кадра, чтобы интерфейс мог наложить её на фото.
            full_h, full_w = rgb.shape[0], rgb.shape[1]
            box = [
                round((bx0 + x0) * f / full_w, 4),
                round((by0 + y0) * f / full_h, 4),
                round(bw * f / full_w, 4),
                round(bh * f / full_h, 4),
            ]
            severity = "LOW" if ratio < 0.01 else "MEDIUM" if ratio < 0.03 else "HIGH" if ratio < 0.07 else "CRITICAL"
            detections.append({
                "type": "ROAD_DAMAGE",
                "score": score,
                "bbox": box,
                "areaRatio": round(ratio, 4),
                "severity": severity,
                "method": self.name,
                "experimental": True,
            })
        detections.sort(key=lambda d: d["score"], reverse=True)
        return detections[:3]
