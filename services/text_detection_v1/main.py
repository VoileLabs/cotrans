
from typing import Any
from models import *
from detector import load_model, run_detection

import numpy as np
from PIL import Image
import io
import cv2
import secrets

from fastapi import FastAPI, Form, File, UploadFile, Response
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

class NparrayAndImageResponse(Response) :
	def render(self, content: Any) -> bytes:
		boundary = secrets.token_bytes(16).hex()
		np_data: np.ndarray = content["array"]
		img_data: Image.Image = content["img"]
		img_type: str = content["img-type"]
		self.media_type = f"multipart/related; boundary={boundary}; start=\"npData\";"
		ans = io.BytesIO()
		ans.write(f"--{boundary}\r\n".encode('utf-8'))
		ans.write(b"Content-Type: application/vnd.voilelabs.nparray\r\nContent-ID: npData\r\n\r\n")
		np.save(ans, np_data)
		ans.write(f"\r\n--{boundary}\r\n".encode('utf-8'))
		ans.write(f"Content-Type: image/{img_type}\r\nContent-ID: imageData\r\n\r\n".encode('utf-8'))
		img_data.save(ans, format = 'PNG')
		ans.write(f"\r\n--{boundary}--".encode('utf-8'))
		return ans.getvalue()

class JsonAndNparrayAndImageResponse(Response) :
	def render(self, content: Any) -> bytes:
		boundary = secrets.token_bytes(16).hex()
		json_data: dict = content["json"]
		np_data: np.ndarray = content["array"]
		img_data: Image.Image = content["img"]
		img_type: str = content["img-type"]
		self.media_type = f"multipart/related; boundary={boundary}; start=\"jsonData\";"
		ans = io.BytesIO()
		json_content = json.dumps(json_data)
		ans.write(f"--{boundary}\r\n".encode('utf-8'))
		ans.write(b"Content-Type: application/json\r\nContent-ID: jsonData\r\n\r\n")
		ans.write(json_content.encode('utf-8'))
		ans.write(f"--{boundary}\r\n".encode('utf-8'))
		ans.write(b"Content-Type: application/vnd.voilelabs.nparray\r\nContent-ID: npData\r\n\r\n")
		np.save(ans, np_data)
		ans.write(f"\r\n--{boundary}\r\n".encode('utf-8'))
		ans.write(f"Content-Type: image/{img_type}\r\nContent-ID: imageData\r\n\r\n".encode('utf-8'))
		img_data.save(ans, format = 'PNG')
		ans.write(f"\r\n--{boundary}--".encode('utf-8'))
		return ans.getvalue()

@app.post("/v1/detect")
async def detect(config: V1TextDetectionRequest = Form(), image: UploadFile = File()) :
	img = Image.open(image.file)
	img_np = np.asarray(img)
	textlines, mask_np, version = run_detection(app, config, img_np)
	resp = V1TextDetectionResponse(regions = textlines, version = version)
	return JsonAndImageResponse({"json": resp.dict(exclude_none = True), "img": Image.fromarray(mask_np), "img-type": "png"})

@app.on_event("startup")
async def startup_event() :
	load_model(app)
