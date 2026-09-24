"""Integration test of the REAL MediaPipe pipeline on a real image sequence.

Requires mediapipe + a pose .task model, and a single real photo of a standing person.
The "lying" frame is derived by rotating that photo 90 degrees in-frame. This verifies
MediaPipe pose extraction + the temporal fall heuristic + scoring end to end.

Run:
  POSE_MODEL_PATH=/path/pose_landmarker_lite.task FALL_STAND_IMAGE=/path/person.jpg \
    python -m unittest test_video -v
If the model or image is missing the test is skipped (not failed).
"""
import os
import unittest

MODEL = os.environ.get("POSE_MODEL_PATH", "/models/pose_landmarker_lite.task")
IMAGE = os.environ.get("FALL_STAND_IMAGE", "")


def _observation_from_landmarks(landmarks, at):
    from detectors import Observation
    joints = [11, 12, 23, 24, 27, 28]
    return Observation(
        at,
        (landmarks[23].x + landmarks[24].x) / 2,
        (landmarks[23].y + landmarks[24].y) / 2,
        (landmarks[11].x + landmarks[12].x) / 2,
        (landmarks[11].y + landmarks[12].y) / 2,
        max(landmarks[j].x for j in joints) - min(landmarks[j].x for j in joints),
        max(landmarks[j].y for j in joints) - min(landmarks[j].y for j in joints),
        min(landmarks[j].visibility for j in joints),
    )


@unittest.skipUnless(os.path.isfile(MODEL) and IMAGE and os.path.isfile(IMAGE), "Pose model or FALL_STAND_IMAGE not provided")
class RealVideoTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import numpy as np
        import mediapipe as mp
        from PIL import Image
        from detectors import DetectionPipeline
        cls.np = np
        cls.mp = mp
        cls.DetectionPipeline = DetectionPipeline
        opts = mp.tasks.vision.PoseLandmarkerOptions(
            base_options=mp.tasks.BaseOptions(model_asset_path=MODEL),
            num_poses=2,
            min_pose_detection_confidence=0.6,
        )
        cls.landmarker = mp.tasks.vision.PoseLandmarker.create_from_options(opts)
        cls.stand = Image.open(IMAGE).convert("RGB")
        cls.lie = cls.stand.rotate(-90, expand=True)

    def _obs(self, image, at):
        result = self.landmarker.detect(self.mp.Image(image_format=self.mp.ImageFormat.SRGB, data=self.np.asarray(image)))
        self.assertEqual(len(result.pose_landmarks), 1, "expected exactly one pose")
        return _observation_from_landmarks(result.pose_landmarks[0], at)

    def test_horizontal_without_standing_baseline_is_not_a_fall(self):
        pipeline = self.DetectionPipeline(6)
        standing = self._obs(self.stand, 0)
        lying = self._obs(self.lie, 1)
        fresh = self.DetectionPipeline(6)
        events = []
        t = 0.0
        while t < 12:
            events += fresh.update(self._obs(self.lie, t))
            t += 0.5
        self.assertEqual(events, [])
        self.assertEqual(pipeline.update(standing), [])

    def test_stand_then_lie_triggers_person_fall(self):
        pipeline = self.DetectionPipeline(6)
        pipeline.update(self._obs(self.stand, 0))
        lying = self._obs(self.lie, 1)
        events = []
        t = 1.0
        while t < 20 and not events:
            events += pipeline.update(self._obs(self.lie, t))
            t += 0.5
        self.assertTrue(events, "temporal fall heuristic did not trigger")
        event = events[0]
        self.assertEqual(event["type"], "PERSON_FALL")
        self.assertIn("score", event)
        self.assertIn("poseVisibility", event)
        self.assertGreater(event["durationSeconds"], 0)


if __name__ == "__main__":
    unittest.main()
