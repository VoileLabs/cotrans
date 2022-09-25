
from typing import Any
from models import *
from inpainting import load_model, run_inpainting

import numpy as np
from PIL import Image
import io
import cv2
import secrets

from fastapi import FastAPI, Form, File, UploadFile, Response
from fastapi.responses import StreamingResponse

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

@app.post("/v1/inpaint")
async def inpaint(config: V1InapintingLamaRequest = Form(), image: UploadFile = File(), mask: UploadFile = File()) :
	img = Image.open(image.file)
	img_np = np.asarray(img)
	mask = Image.open(mask.file)
	mask_np = np.asarray(mask)
	if image.shape[:2] != mask.shape[:2] :
		raise ValueError(f'Image size (={image.shape[:2]}) must be the same as mask size (={mask.shape[:2]})')
	if len(mask_np.shape) != 2 :
		if mask_np.shape[-1] == 3 :
			mask_np = mask_np[:, :, 0]
	inpainted_img_np, version = run_inpainting(app, config, img_np, mask_np)
	resp = V1InapintingLamaResponse(version = version)
	return JsonAndImageResponse({"json": resp.dict(), "img": Image.fromarray(inpainted_img_np), "img-type": "png"})

@app.on_event("startup")
async def startup_event() :
	load_model(app)
