import io
import os
import secrets
import threading
import time
from pathlib import Path
import numpy as np
from PIL import Image
import mediapipe as mp
from fastapi import FastAPI, Request, HTTPException
from starlette.concurrency import run_in_threadpool
from detectors import Observation, DetectionPipeline, RoadDamageDetector

app = FastAPI(title="Aqtau isolated CV service")
model_path = os.environ.get("POSE_MODEL_PATH", "/models/pose_landmarker_lite.task")
key = os.environ.get("CV_SERVICE_KEY", "")
demo = os.environ.get("DEMO_MODE", "false") == "true"
timeout = float(os.environ.get("DEMO_FALL_TIMEOUT" if demo else "FALL_TIMEOUT", "8" if demo else "240"))
timeout = min(10,max(5,timeout)) if demo else min(300,max(30,timeout))
enable_fight = os.environ.get("ENABLE_FIGHT", "false") == "true"
lock = threading.Lock()
sessions = {}
landmarker = None

@app.get("/health")
def health():
    return {"ready":Path(model_path).is_file() and bool(key),"model":"MediaPipe Pose Landmarker","fall":"experimental temporal heuristic","fight":"experimental pose-motion heuristic" if enable_fight else "disabled (set ENABLE_FIGHT=true)","timeoutSeconds":timeout}

road_detector = RoadDamageDetector()

@app.post("/detect-road")
async def detect_road(request: Request):
    if not key or not secrets.compare_digest(request.headers.get("authorization",""),"Bearer "+key):
        raise HTTPException(401)
    length=request.headers.get("content-length","0")
    if not length.isdecimal(): raise HTTPException(400,"Invalid content length")
    if int(length)>5000000: raise HTTPException(413)
    data=bytearray()
    async for chunk in request.stream():
        if len(data)+len(chunk)>5000000: raise HTTPException(413)
        data.extend(chunk)
    try:
        image=Image.open(io.BytesIO(data))
        if image.width*image.height>4096*4096: raise ValueError()
        pixels=np.asarray(image.convert("RGB"))
    except Exception:
        raise HTTPException(400,"Invalid image")
    detections=road_detector.detect(pixels)
    return {"detections":detections,"detector":RoadDamageDetector.name,"kind":"classical-cv-heuristic","isMock":False,"width":image.width,"height":image.height}

@app.post("/analyze")
async def analyze(request: Request, session: str):
    if not key or not secrets.compare_digest(request.headers.get("authorization",""),"Bearer "+key):
        raise HTTPException(401)
    if len(session)>64: raise HTTPException(400)
    length=request.headers.get("content-length","0")
    if not length.isdecimal(): raise HTTPException(400,"Invalid content length")
    if int(length)>500000: raise HTTPException(413)
    data=bytearray()
    async for chunk in request.stream():
        if len(data)+len(chunk)>500000: raise HTTPException(413)
        data.extend(chunk)
    if not Path(model_path).is_file(): raise HTTPException(503,"Pose model not installed")
    try:
        image=Image.open(io.BytesIO(data))
        if image.width*image.height>1280*1280: raise ValueError()
        pixels=np.asarray(image.convert("RGB"))
    except Exception:
        raise HTTPException(400,"Invalid image")
    return await run_in_threadpool(process,session,pixels)

def process(session,pixels):
    global landmarker
    with lock:
        now=time.monotonic()
        for stale in [k for k,v in sessions.items() if now-v["last"]>60]:
            sessions.pop(stale)
        if session not in sessions:
            if len(sessions)>=16: raise HTTPException(429,"CV capacity")
            sessions[session]={"last":now,"pipeline":DetectionPipeline(timeout,enable_fight=enable_fight)}
        if landmarker is None:
            options=mp.tasks.vision.PoseLandmarkerOptions(base_options=mp.tasks.BaseOptions(model_asset_path=model_path),num_poses=2,min_pose_detection_confidence=.6)
            landmarker=mp.tasks.vision.PoseLandmarker.create_from_options(options)
        result=landmarker.detect(mp.Image(image_format=mp.ImageFormat.SRGB,data=pixels))
        state=sessions[session];state["last"]=now
        def to_observation(p):
            joints=[p[j] for j in [11,12,23,24,27,28]]
            visible=min(j.visibility for j in joints)
            return Observation(now,(p[23].x+p[24].x)/2,(p[23].y+p[24].y)/2,(p[11].x+p[12].x)/2,(p[11].y+p[12].y)/2,max(j.x for j in joints)-min(j.x for j in joints),max(j.y for j in joints)-min(j.y for j in joints),visible)
        all_obs=[to_observation(p) for p in result.pose_landmarks]
        # Падение — одиночная персона; многоперсонные кадры сбрасывают временной трек (как и раньше).
        observation=all_obs[0] if len(all_obs)==1 else None
        events=state["pipeline"].update(observation)+state["pipeline"].update_fight(all_obs,now)
        if events:
            message=events[0].get("type")
        else:
            message="CV: анализ позы и последовательности"
        return {"events":events,"people":len(result.pose_landmarks),"message":message,"isMock":False}

