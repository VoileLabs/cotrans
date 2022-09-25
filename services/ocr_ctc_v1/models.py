
from typing import List, Optional, Tuple
from pydantic import BaseModel, ValidationError, validator

import json

class TextRegionExchangeFormat(BaseModel) :
	fmt: str
	coords: str
	fg: Optional[Tuple[int, int, int]]
	bg: Optional[Tuple[int, int, int]]
	text: Optional[str]
	prob: Optional[float] = 0
	direction: Optional[str]
	
class V1OCRCTCRequest(BaseModel) :
	regions: List[TextRegionExchangeFormat]
	max_chunk_size: int = 16
	cuda: bool = False
	text_prob_threshold: float = 0.3

	@classmethod
	def __get_validators__(cls):
		yield cls.validate_to_json

	@classmethod
	def validate_to_json(cls, value):
		if isinstance(value, str):
			return cls(**json.loads(value))
		return value

class V1OCRCTCResponse(BaseModel) :
	texts: List[TextRegionExchangeFormat]
	version: str

	@classmethod
	def __get_validators__(cls):
		yield cls.validate_to_json

	@classmethod
	def validate_to_json(cls, value):
		if isinstance(value, str):
			return cls(**json.loads(value))
		return value
		