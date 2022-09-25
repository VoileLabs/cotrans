
from shapely.geometry import Polygon, MultiPoint
import numpy as np
import functools
import base64
from typing import List
from models import TextRegionExchangeFormat
import cv2

class BBox(object) :
	def __init__(self, x: int, y: int, w: int, h: int, text: str, prob: float, fg_r: int = 0, fg_g: int = 0, fg_b: int = 0, bg_r: int = 0, bg_g: int = 0, bg_b: int = 0) :
		self.x = x
		self.y = y
		self.w = w
		self.h = h
		self.text = text
		self.prob = prob
		self.fg_r = fg_r
		self.fg_g = fg_g
		self.fg_b = fg_b
		self.bg_r = bg_r
		self.bg_g = bg_g
		self.bg_b = bg_b

	def width(self) :
		return self.w

	def height(self) :
		return self.h

	def to_points(self) :
		tl, tr, br, bl = np.array([self.x, self.y]), np.array([self.x + self.w, self.y]), np.array([self.x + self.w, self.y+ self.h]), np.array([self.x, self.y + self.h])
		return tl, tr, br, bl
		
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


	def get_transformed_region(self, img, direction, textheight) -> np.ndarray :
		[l1a, l1b, l2a, l2b] = [a.astype(np.float32) for a in self.structure]
		v_vec = l1b - l1a
		h_vec = l2b - l2a
		ratio = np.linalg.norm(v_vec) / np.linalg.norm(h_vec)
		src_pts = self.pts.astype(np.float32)
		self.assigned_direction = direction
		if direction == 'h' :
			h = int(textheight)
			w = int(round(textheight / ratio))
			dst_pts = np.array([[0, 0], [w - 1, 0], [w - 1, h - 1], [0, h - 1]]).astype(np.float32)
			M, _ = cv2.findHomography(src_pts, dst_pts, cv2.RANSAC, 5.0)
			region = cv2.warpPerspective(img, M, (w, h))
			return region
		elif direction == 'v' :
			w = int(textheight)
			h = int(round(textheight * ratio))
			dst_pts = np.array([[0, 0], [w - 1, 0], [w - 1, h - 1], [0, h - 1]]).astype(np.float32)
			M, _ = cv2.findHomography(src_pts, dst_pts, cv2.RANSAC, 5.0)
			region = cv2.warpPerspective(img, M, (w, h))
			region = cv2.rotate(region, cv2.ROTATE_90_COUNTERCLOCKWISE)
			return region

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

	@functools.cached_property
	def aabb(self) -> BBox :
		kq = self.pts
		max_coord = np.max(kq, axis = 0)
		min_coord = np.min(kq, axis = 0)
		return BBox(min_coord[0], min_coord[1], max_coord[0] - min_coord[0], max_coord[1] - min_coord[1], self.text, self.prob, self.fg_r, self.fg_g, self.fg_b, self.bg_r, self.bg_g, self.bg_b)

	@staticmethod
	def from_tref(tref: TextRegionExchangeFormat, w: int, h: int) :
		if tref.fmt != 'quad' :
			raise ValueError(f'Not a quad TREF (is {tref.fmt})')
		p = np.copy(np.frombuffer(base64.b64decode(tref.coords), dtype = np.float32)).reshape((-1, 2))
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
		ret = Quadrilateral(p, tref.text, tref.prob, fg_r, fg_g, fg_b, bg_r, bg_g, bg_b)
		if tref.direction :
			if tref.direction in ['h', 'w'] :
				ret.assigned_direction = tref.direction
		return ret

def dist(x1, y1, x2, y2) :
	return np.sqrt((x1 - x2) * (x1 - x2) + (y1 - y2) * (y1 - y2))

def rect_distance(x1, y1, x1b, y1b, x2, y2, x2b, y2b):
	left = x2b < x1
	right = x1b < x2
	bottom = y2b < y1
	top = y1b < y2
	if top and left:
		return dist(x1, y1b, x2b, y2)
	elif left and bottom:
		return dist(x1, y1, x2b, y2b)
	elif bottom and right:
		return dist(x1b, y1, x2, y2b)
	elif right and top:
		return dist(x1b, y1b, x2, y2)
	elif left:
		return x1 - x2b
	elif right:
		return x2 - x1b
	elif bottom:
		return y1 - y2b
	elif top:
		return y2 - y1b
	else:             # rectangles intersect
		return 0


def quadrilateral_can_merge_region(a: Quadrilateral, b: Quadrilateral, ratio = 1.9, discard_connection_gap = 5, char_gap_tolerance = 0.6, char_gap_tolerance2 = 1.5, font_size_ratio_tol = 1.5, aspect_ratio_tol = 2) -> bool :
	b1 = a.aabb
	b2 = b.aabb
	char_size = min(a.font_size, b.font_size)
	x1, y1, w1, h1 = b1.x, b1.y, b1.w, b1.h
	x2, y2, w2, h2 = b2.x, b2.y, b2.w, b2.h
	dist = rect_distance(x1, y1, x1 + w1, y1 + h1, x2, y2, x2 + w2, y2 + h2)
	if dist > discard_connection_gap * char_size :
		return False
	if max(a.font_size, b.font_size) / char_size > font_size_ratio_tol :
		return False
	if a.aspect_ratio > aspect_ratio_tol and b.aspect_ratio < 1. / aspect_ratio_tol :
		return False
	if b.aspect_ratio > aspect_ratio_tol and a.aspect_ratio < 1. / aspect_ratio_tol :
		return False
	a_aa = a.is_approximate_axis_aligned
	b_aa = b.is_approximate_axis_aligned
	if a_aa and b_aa :
		if dist < char_size * char_gap_tolerance :
			if abs(x1 + w1 // 2 - (x2 + w2 // 2)) < char_gap_tolerance2 :
				return True
			if w1 > h1 * ratio and h2 > w2 * ratio :
				return False
			if w2 > h2 * ratio and h1 > w1 * ratio :
				return False
			if w1 > h1 * ratio or w2 > h2 * ratio : # h
				return abs(x1 - x2) < char_size * char_gap_tolerance2 or abs(x1 + w1 - (x2 + w2)) < char_size * char_gap_tolerance2
			elif h1 > w1 * ratio or h2 > w2 * ratio : # v
				return abs(y1 - y2) < char_size * char_gap_tolerance2 or abs(y1 + h1 - (y2 + h2)) < char_size * char_gap_tolerance2
			return False
		else :
			return False
	if True:#not a_aa and not b_aa :
		if abs(a.angle - b.angle) < 15 * np.pi / 180 :
			fs_a = a.font_size
			fs_b = b.font_size
			fs = min(fs_a, fs_b)
			if a.poly_distance(b) > fs * char_gap_tolerance2 :
				return False
			if abs(fs_a - fs_b) / fs > 0.25 :
				return False
			return True
	return False

class AvgMeter() :
	def __init__(self) :
		self.reset()

	def reset(self) :
		self.sum = 0
		self.count = 0

	def __call__(self, val = None) :
		if val is not None :
			self.sum += val
			self.count += 1
		if self.count > 0 :
			return self.sum / self.count
		else :
			return 0

class TextBlock(object):
	pass
