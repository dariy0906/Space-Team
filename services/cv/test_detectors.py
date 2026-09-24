import unittest
from detectors import FallDetector,FightDetector,Observation
def standing(t):return Observation(t,.5,.45,.5,.2,.2,.7,.9)
def down(t):return Observation(t,.5,.7,.75,.72,.65,.2,.9)
def pair(t,dx=0.0):
    return [Observation(t,.3+dx,.5,.3+dx,.3,.2,.4,.9),Observation(t,.7+dx,.5,.7+dx,.3,.2,.4,.9)]
class FightTests(unittest.TestCase):
    def test_disabled_is_noop(self):
        d=FightDetector(enabled=False); self.assertIsNone(d.update(pair(0,0.2),0))
    def test_single_person_is_not_a_fight(self):
        d=FightDetector(enabled=True); one=[Observation(0,.5,.5,.5,.3,.2,.4,.9)]
        for t in range(1,8): self.assertIsNone(d.update(one,t*0.5))
    def test_calm_two_people_is_not_a_fight(self):
        d=FightDetector(enabled=True)
        for t in range(0,8): self.assertIsNone(d.update(pair(t*0.5),t*0.5))
    def test_sustained_motion_of_two_people_triggers(self):
        d=FightDetector(enabled=True,min_duration=2.0,threshold=0.06)
        ev=None
        for k in range(16):
            dx=0.12 if k%2 else 0.0
            ev=d.update(pair(k*0.5,dx),k*0.5)
            if ev: break
        self.assertIsNotNone(ev)
        self.assertEqual(ev["type"],"POSSIBLE_FIGHT")
        self.assertEqual(ev["peopleCount"],2)
        self.assertTrue(ev["experimental"])
        self.assertGreater(ev["score"],0)
    def test_motion_shorter_than_window_does_not_trigger(self):
        d=FightDetector(enabled=True,min_duration=2.0)
        self.assertIsNone(d.update(pair(0,0.2),0))
        self.assertIsNone(d.update(pair(0.5,0.4),0.5))
        self.assertIsNone(d.update(pair(1.0,0.6),1.0))  # calm again → reset
        for t in range(3,8): self.assertIsNone(d.update(pair(t*0.5),t*0.5))
class TemporalTests(unittest.TestCase):
    def test_initial_horizontal_is_not_fall(self):
        d=FallDetector(5)
        self.assertTrue(all(d.update(down(t)) is None for t in range(10)))
    def test_transition_and_dwell(self):
        d=FallDetector(5);d.update(standing(0));self.assertIsNone(d.update(down(1)))
        for t in range(2,6):self.assertIsNone(d.update(down(t)))
        self.assertEqual(d.update(down(6))["type"],"PERSON_FALL")
        self.assertIsNone(d.update(down(7)))
    def test_gap_resets_track(self):
        d=FallDetector(5);d.update(standing(0));d.update(down(1))
        self.assertIsNone(d.update(down(10)))
    def test_recovery_resets(self):
        d=FallDetector(5);d.update(standing(0));d.update(down(1));d.update(standing(2))
        self.assertIsNone(d.update(down(3)))
if __name__=="__main__":unittest.main()

