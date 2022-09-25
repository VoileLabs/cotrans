
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
    
class V1TextDetectionRequest(BaseModel):
    text_threshold: Optional[float] = 0.5
    box_threshold: Optional[float] = 0.7
    area_threshold: Optional[float] = 16
    unclip_ratio: Optional[float] = 2.3
    cuda: Optional[bool] = False
    blur: Optional[bool] = True
    blur_ks: Optional[int] = 17
    blur_sigma_color: Optional[int] = 80
    blur_sigma_space: Optional[int] = 80
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

