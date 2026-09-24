import unittest
import numpy as np
from detectors import RoadDamageDetector

H, W = 480, 640


def road(seed=1):
    # Асфальт: средне-серый с мелкой текстурой.
    rng = np.random.default_rng(seed)
    base = 120 + rng.normal(0, 8, (H, W))
    return np.clip(np.stack([base, base, base], axis=-1), 0, 255)


def pothole(img, cy, cx, ry=26, rx=42, value=45):
    # Неровный тёмный овал с резкой границей — как тень внутри выбоины.
    yy, xx = np.mgrid[0:H, 0:W]
    angle = np.arctan2(yy - cy, xx - cx)
    wobble = 1 + 0.18 * np.sin(3 * angle) + 0.08 * np.cos(5 * angle)
    inside = ((yy - cy) / ry) ** 2 + ((xx - cx) / rx) ** 2 <= wobble ** 2
    img[inside] = value
    return img


class RoadDamageTests(unittest.TestCase):
    def setUp(self):
        self.detector = RoadDamageDetector()

    def test_detects_pothole_on_road(self):
        img = pothole(road(), cy=int(H * 0.75), cx=int(W * 0.5))
        found = self.detector.detect(img)
        self.assertEqual(len(found), 1)
        d = found[0]
        self.assertGreaterEqual(d["score"], 55)
        x, y, w, h = d["bbox"]
        # Рамка накрывает яму (центр кадра по x, нижняя часть по y).
        self.assertLess(abs((x + w / 2) - 0.5), 0.05)
        self.assertLess(abs((y + h / 2) - 0.75), 0.05)
        self.assertEqual(d["method"], "road-damage-heuristic-v1")
        self.assertTrue(d["experimental"])

    def test_plain_road_has_no_detections(self):
        self.assertEqual(self.detector.detect(road(seed=2)), [])

    def test_bright_lane_marking_is_ignored(self):
        img = road(seed=3)
        img[int(H * 0.5):, 300:320] = 235
        self.assertEqual(self.detector.detect(img), [])

    def test_large_soft_shadow_is_ignored(self):
        img = road(seed=4)
        ramp = np.linspace(0.45, 1.0, W // 2)
        img[int(H * 0.45):, : W // 2] *= ramp[None, :, None]
        self.assertEqual(self.detector.detect(img), [])

    def test_dark_spot_outside_road_area_is_ignored(self):
        img = pothole(road(seed=5), cy=int(H * 0.15), cx=int(W * 0.5))
        self.assertEqual(self.detector.detect(img), [])

    def test_severity_grows_with_size(self):
        small = self.detector.detect(pothole(road(seed=6), cy=int(H * 0.75), cx=int(W * 0.5), ry=14, rx=22))
        large = self.detector.detect(pothole(road(seed=6), cy=int(H * 0.75), cx=int(W * 0.5), ry=45, rx=80))
        order = ["LOW", "MEDIUM", "HIGH", "CRITICAL"]
        self.assertTrue(small and large)
        self.assertLess(order.index(small[0]["severity"]), order.index(large[0]["severity"]))


if __name__ == "__main__":
    unittest.main()
