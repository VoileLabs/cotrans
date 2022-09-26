
from typing import Any
from models import *
from textline_merge import run_merge

import numpy as np
from PIL import Image
import io
import cv2
import secrets

from fastapi import FastAPI, Body
from fastapi.responses import JSONResponse
app = FastAPI()

@app.post("/v1/merge")
async def merge(config: V1TextlineMergeRequest) :
	if isinstance(config, dict) :
		config = V1TextlineMergeRequest.parse_obj(config)
	textlines = [Quadrilateral.from_tref(t, config.width, config.height) for t in config.textlines]
	regions, version = run_merge(config, textlines, config.width, config.height)
	resp = V1TextlineMergeResponse(regions = [r.to_tref_and_normalize(config.width, config.height) for r in regions], version = version)
	return JSONResponse(resp.dict(exclude_none = True))
