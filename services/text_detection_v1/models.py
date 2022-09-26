
from __future__ import annotations
from typing import List, Optional, Tuple
from pydantic import BaseModel

import json

class TextRegionExchangeFormat(BaseModel) :
	fmt: str
	coords: str
	fg: Optional[Tuple[int, int, int]]
	bg: Optional[Tuple[int, int, int]]
	text: Optional[str]
	prob: Optional[float] = 0
	direction: Optional[str]
	lines: List[TextRegionExchangeFormat] = []

TextRegionExchangeFormat.update_forward_refs()

class V1TextDetectionRequest(BaseModel):
	text_threshold: float = 0.5
	box_threshold: float = 0.7
	area_threshold: float = 16
	unclip_ratio: float = 2.3
	cuda: bool = False
	blur: bool = True
	blur_ks: int = 17
	blur_sigma_color: int = 80
	blur_sigma_space: int = 80
	target_ratio: float
	pad_width: int
	pad_height: int
	width: int # original image width
	height: int # original image height

	@classmethod
	def __get_validators__(cls):
		yield cls.validate_to_json

	@classmethod
	def validate_to_json(cls, value):
		if isinstance(value, str):
			return cls(**json.loads(value))
		return value


class V1TextDetectionResponse(BaseModel) :
	regions: List[TextRegionExchangeFormat]
	version: str

	@classmethod
	def __get_validators__(cls):
		yield cls.validate_to_json

	@classmethod
	def validate_to_json(cls, value):
		if isinstance(value, str):
			return cls(**json.loads(value))
		return value

