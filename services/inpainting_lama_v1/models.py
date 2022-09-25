
from typing import Optional
from pydantic import BaseModel, ValidationError, validator

import json

class V1InapintingLamaRequest(BaseModel) :
    use_poisson_blending: bool = False
    cuda: bool = False
    inpainting_size: int = 1024

    @classmethod
    def __get_validators__(cls):
        yield cls.validate_to_json

    @classmethod
    def validate_to_json(cls, value):
        if isinstance(value, str):
            return cls(**json.loads(value))
        return value

    @validator("inpainting_size")
    def divisible_by_pad_size(cls, v) :
        pad_size = 8
        if v % pad_size != 0 :
            raise ValueError(f'inpainting_size(={v}) must be divisible by {pad_size}')
        return v

class V1InapintingLamaResponse(BaseModel) :
    version: str

    @classmethod
    def __get_validators__(cls):
        yield cls.validate_to_json

    @classmethod
    def validate_to_json(cls, value):
        if isinstance(value, str):
            return cls(**json.loads(value))
        return value
        