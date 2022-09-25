
from typing import Any
from models import *
from ocr import load_model, run_ocr

import numpy as np
from PIL import Image
import io
import cv2
import secrets

from fastapi import FastAPI, Form, File, UploadFile, Response
from fastapi.responses import JSONResponse

from utils import Quadrilateral

app = FastAPI()

class JsonAndImageResponse(Response) :
	def render(self, content: Any) -> bytes:
		boundary = secrets.token_bytes(16).hex()
		json_data: dict = content["json"]
		img_data: Image.Image = content["img"]
		img_type: str = content["img-type"]
		self.media_type = f"multipart/related; boundary={boundary}; start=\"jsonData\";"
		json_content = json.dumps(json_data)
		ans = io.BytesIO()
		ans.write(f"--{boundary}\r\n".encode('utf-8'))
		ans.write(b"Content-Type: application/json\r\nContent-ID: jsonData\r\n\r\n")
		ans.write(json_content.encode('utf-8'))
		ans.write(f"\r\n--{boundary}\r\n".encode('utf-8'))
		ans.write(f"Content-Type: image/{img_type}\r\nContent-ID: imageData\r\n\r\n".encode('utf-8'))
		img_data.save(ans, format = 'PNG')
		ans.write(f"\r\n--{boundary}--".encode('utf-8'))
		return ans.getvalue()

def get_bbox(tref: TextRegionExchangeFormat, w: int, h: int) :
	if tref.fmt == 'quad' :
		return Quadrilateral.from_tref(tref, w, h)
	elif tref.fmt == 'textbox' :
		raise NotImplemented

@app.post("/v1/ocr")
async def ocr(config: V1OCRCTCRequest = Form(), image: UploadFile = File()) :
	img = Image.open(image.file)
	w, h = img.width, img.height
	img_np = np.asarray(img)
	regions = [get_bbox(t, w, h) for t in config.regions]
	quads, version = run_ocr(app, config, img_np, regions)
	resp = V1OCRCTCResponse(texts = [t.to_tref_and_normalize(w, h) for t in quads], version = version)
	return JSONResponse(resp.dict(exclude_none = True))

@app.on_event("startup")
async def startup_event() :
	load_model(app)
