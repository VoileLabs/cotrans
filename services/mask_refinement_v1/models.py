
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

from utils import Quadrilateral

TextRegionExchangeFormat.update_forward_refs()

class V1MaskRefinementRequest(BaseModel) :
	method: str = 'fit_text'
	textlines: List[TextRegionExchangeFormat]

	@classmethod
	def __get_validators__(cls):
		yield cls.validate_to_json

	@classmethod
	def validate_to_json(cls, value):
		if isinstance(value, str):
			return cls(**json.loads(value))
		return value

class V1MaskRefinementResponse(BaseModel) :
	version: str

	@classmethod
	def __get_validators__(cls):
		yield cls.validate_to_json

	@classmethod
	def validate_to_json(cls, value):
		if isinstance(value, str):
			return cls(**json.loads(value))
		return value
