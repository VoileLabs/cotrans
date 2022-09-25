
from shapely.geometry import Polygon, MultiPoint
import numpy as np
import functools
import base64
from typing import List
from models import TextRegionExchangeFormat

class Quadrilateral(object) :
	def __init__(self, pts: np.ndarray, text: str, prob: float, fg_r: int = 0, fg_g: int = 0, fg_b: int = 0, bg_r: int = 0, bg_g: int = 0, bg_b: int = 0) :
		self.pts = pts
		self.text = text
		self.prob = prob
		self.fg_r = fg_r
		self.fg_g = fg_g
		self.fg_b = fg_b
		self.bg_r = bg_r
		self.bg_g = bg_g
		self.bg_b = bg_b
		self.assigned_direction = None

	@functools.cached_property
	def structure(self) -> List[np.ndarray] :
		p1 = ((self.pts[0] + self.pts[1]) / 2).astype(int)
		p2 = ((self.pts[2] + self.pts[3]) / 2).astype(int)
		p3 = ((self.pts[1] + self.pts[2]) / 2).astype(int)
		p4 = ((self.pts[3] + self.pts[0]) / 2).astype(int)
		return [p1, p2, p3, p4]

	@functools.cached_property
	def valid(self) -> bool :
		[l1a, l1b, l2a, l2b] = [a.astype(np.float32) for a in self.structure]
		v1 = l1b - l1a
		v2 = l2b - l2a
		unit_vector_1 = v1 / np.linalg.norm(v1)
		unit_vector_2 = v2 / np.linalg.norm(v2)
		dot_product = np.dot(unit_vector_1, unit_vector_2)
		angle = np.arccos(dot_product) * 180 / np.pi
		return abs(angle - 90) < 10

	@functools.cached_property
	def aspect_ratio(self) -> float :
		[l1a, l1b, l2a, l2b] = [a.astype(np.float32) for a in self.structure]
		v1 = l1b - l1a
		v2 = l2b - l2a
		return np.linalg.norm(v2) / np.linalg.norm(v1)

	@functools.cached_property
	def font_size(self) -> float :
		[l1a, l1b, l2a, l2b] = [a.astype(np.float32) for a in self.structure]
		v1 = l1b - l1a
		v2 = l2b - l2a
		return min(np.linalg.norm(v2), np.linalg.norm(v1))

	def width(self) -> int :
		return self.aabb.w

	def height(self) -> int :
		return self.aabb.h

	def clip(self, width, height) :
		self.pts[:, 0] = np.clip(np.round(self.pts[:, 0]), 0, width)
		self.pts[:, 1] = np.clip(np.round(self.pts[:, 1]), 0, height)


	@functools.cached_property
	def is_axis_aligned(self) -> bool :
		[l1a, l1b, l2a, l2b] = [a.astype(np.float32) for a in self.structure]
		v1 = l1b - l1a
		v2 = l2b - l2a
		e1 = np.array([0, 1])
		e2 = np.array([1, 0])
		unit_vector_1 = v1 / np.linalg.norm(v1)
		unit_vector_2 = v2 / np.linalg.norm(v2)
		if abs(np.dot(unit_vector_1, e1)) < 1e-2 or abs(np.dot(unit_vector_1, e2)) < 1e-2 :
			return True
		return False

	@functools.cached_property
	def is_approximate_axis_aligned(self) -> bool :
		[l1a, l1b, l2a, l2b] = [a.astype(np.float32) for a in self.structure]
		v1 = l1b - l1a
		v2 = l2b - l2a
		e1 = np.array([0, 1])
		e2 = np.array([1, 0])
		unit_vector_1 = v1 / np.linalg.norm(v1)
		unit_vector_2 = v2 / np.linalg.norm(v2)
		if abs(np.dot(unit_vector_1, e1)) < 0.05 or abs(np.dot(unit_vector_1, e2)) < 0.05 or abs(np.dot(unit_vector_2, e1)) < 0.05 or abs(np.dot(unit_vector_2, e2)) < 0.05 :
			return True
		return False

	@functools.cached_property
	def direction(self) -> str :
		[l1a, l1b, l2a, l2b] = [a.astype(np.float32) for a in self.structure]
		v_vec = l1b - l1a
		h_vec = l2b - l2a
		if np.linalg.norm(v_vec) > np.linalg.norm(h_vec) :
			return 'v'
		else :
			return 'h'

	@functools.cached_property
	def cosangle(self) -> float :
		[l1a, l1b, l2a, l2b] = [a.astype(np.float32) for a in self.structure]
		v1 = l1b - l1a
		e2 = np.array([1, 0])
		unit_vector_1 = v1 / np.linalg.norm(v1)
		return np.dot(unit_vector_1, e2)

	@functools.cached_property
	def angle(self) -> float :
		return np.fmod(np.arccos(self.cosangle) + np.pi, np.pi)

	@functools.cached_property
	def centroid(self) -> np.ndarray :
		return np.average(self.pts, axis = 0)


	@functools.cached_property
	def polygon(self) -> Polygon :
		return MultiPoint([tuple(self.pts[0]), tuple(self.pts[1]), tuple(self.pts[2]), tuple(self.pts[3])]).convex_hull

	@functools.cached_property
	def area(self) -> float :
		return self.polygon.area

	def poly_distance(self, other) -> float :
		return self.polygon.distance(other.polygon)

	def distance(self, other, rho = 0.5) -> float :
		return self.distance_impl(other, rho)# + 1000 * abs(self.angle - other.angle)

	def to_tref_and_normalize(self, w: int, h: int) -> TextRegionExchangeFormat :
		p = self.pts.astype(np.float32)
		p[:, 0] /= float(w - 1)
		p[:, 1] /= float(h - 1)
		coords_base64 = base64.b64encode(p.tobytes()).decode('ascii')
		fg = (self.fg_r, self.fg_g, self.fg_b)
		bg = (self.bg_r, self.bg_g, self.bg_b)
		if fg == (0, 0, 0) :
			fg = None
		if bg == (0, 0, 0) :
			bg = None
		text = self.text if self.text else None
		prob = self.prob if self.prob > 0 else None
		return TextRegionExchangeFormat(fmt = 'quad', coords = coords_base64, fg = fg, bg = bg, text = text, prob = prob)

	@classmethod
	def from_tref(tref: TextRegionExchangeFormat, w: int, h: int) :
		if tref.fmt != 'quad' :
			raise ValueError(f'Not a quad TREF (is {tref.fmt})')
		p = np.frombuffer(base64.b64decode(tref.coords), dtype = np.float32).reshape((-1, 2))
		if p.shape[0] != 4 :
			raise ValueError(f'Quad should be of shape (4, 2), got {p.shape}')
		p[:, 0] *= float(w - 1)
		p[:, 1] *= float(h - 1)
		fg_r = tref.fg[0] if tref.fg else 0
		fg_g = tref.fg[1] if tref.fg else 0
		fg_b = tref.fg[2] if tref.fg else 0
		bg_r = tref.bg[0] if tref.bg else 0
		bg_g = tref.bg[1] if tref.bg else 0
		bg_b = tref.bg[2] if tref.bg else 0
		return Quadrilateral(p, tref.text, tref.prob, fg_r, fg_g, fg_b, bg_r, bg_g, bg_b)