use std::{fmt, str::FromStr};

use axum::body::Bytes;
use chrono::{DateTime, FixedOffset};
use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::prisma;

#[derive(Debug, Clone)]
pub struct Task {
  id: String,
  param: TaskParam,

  source_image: Bytes,

  pub state: TaskState,
  pub last_attempted_at: Option<DateTime<FixedOffset>>,
  pub failed_count: i32,

  pub result: Option<TaskResult>,
}

impl Task {
  pub fn new(
    id: String,
    param: TaskParam,
    source_image: Bytes,
    state: TaskState,
    last_attempted_at: Option<DateTime<FixedOffset>>,
    failed_count: i32,
    result: Option<TaskResult>,
  ) -> Self {
    Self {
      id,
      param,
      source_image,
      state,
      last_attempted_at,
      failed_count,
      result,
    }
  }

  pub fn id(&self) -> &str {
    &self.id
  }

  pub fn param(&self) -> &TaskParam {
    &self.param
  }

  pub fn source_image(&self) -> &Bytes {
    &self.source_image
  }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TaskParam {
  pub target_language: Language,
  pub detector: Detector,
  pub direction: Direction,
  pub translator: Translator,
  pub size: Size,
}

// TODO: PartialEq, Eq
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DBTaskParam {
  pub target_language: prisma::Language,
  pub detector: prisma::Detector,
  pub direction: prisma::Direction,
  pub translator: prisma::Translator,
  pub size: prisma::Size,
}

impl From<DBTaskParam> for TaskParam {
  fn from(param: DBTaskParam) -> Self {
    Self {
      target_language: param.target_language.into(),
      detector: param.detector.into(),
      direction: param.direction.into(),
      translator: param.translator.into(),
      size: param.size.into(),
    }
  }
}

impl From<TaskParam> for DBTaskParam {
  fn from(param: TaskParam) -> Self {
    Self {
      target_language: param.target_language.into(),
      detector: param.detector.into(),
      direction: param.direction.into_db(param.target_language),
      translator: param.translator.into(),
      size: param.size.into(),
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TaskResult {
  pub translation_mask: String,
}

#[derive(Debug, Copy, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[allow(clippy::upper_case_acronyms)]
pub enum Language {
  CHS,
  CHT,
  CSY,
  NLD,
  ENG,
  FRA,
  DEU,
  HUN,
  ITA,
  JPN,
  KOR,
  PLK,
  PTB,
  ROM,
  RUS,
  ESP,
  TRK,
  UKR,
  VIN,
}

impl From<prisma::Language> for Language {
  fn from(language: prisma::Language) -> Self {
    match language {
      prisma::Language::Chs => Language::CHS,
      prisma::Language::Cht => Language::CHT,
      prisma::Language::Csy => Language::CSY,
      prisma::Language::Nld => Language::NLD,
      prisma::Language::Eng => Language::ENG,
      prisma::Language::Fra => Language::FRA,
      prisma::Language::Deu => Language::DEU,
      prisma::Language::Hun => Language::HUN,
      prisma::Language::Ita => Language::ITA,
      prisma::Language::Jpn => Language::JPN,
      prisma::Language::Kor => Language::KOR,
      prisma::Language::Plk => Language::PLK,
      prisma::Language::Ptb => Language::PTB,
      prisma::Language::Rom => Language::ROM,
      prisma::Language::Rus => Language::RUS,
      prisma::Language::Esp => Language::ESP,
      prisma::Language::Trk => Language::TRK,
      prisma::Language::Ukr => Language::UKR,
      prisma::Language::Vin => Language::VIN,
    }
  }
}

impl From<Language> for prisma::Language {
  fn from(val: Language) -> Self {
    match val {
      Language::CHS => prisma::Language::Chs,
      Language::CHT => prisma::Language::Cht,
      Language::CSY => prisma::Language::Csy,
      Language::NLD => prisma::Language::Nld,
      Language::ENG => prisma::Language::Eng,
      Language::FRA => prisma::Language::Fra,
      Language::DEU => prisma::Language::Deu,
      Language::HUN => prisma::Language::Hun,
      Language::ITA => prisma::Language::Ita,
      Language::JPN => prisma::Language::Jpn,
      Language::KOR => prisma::Language::Kor,
      Language::PLK => prisma::Language::Plk,
      Language::PTB => prisma::Language::Ptb,
      Language::ROM => prisma::Language::Rom,
      Language::RUS => prisma::Language::Rus,
      Language::ESP => prisma::Language::Esp,
      Language::TRK => prisma::Language::Trk,
      Language::UKR => prisma::Language::Ukr,
      Language::VIN => prisma::Language::Vin,
    }
  }
}

impl fmt::Display for Language {
  fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
    match self {
      Language::CHS => write!(f, "CHS"),
      Language::CHT => write!(f, "CHT"),
      Language::CSY => write!(f, "CSY"),
      Language::NLD => write!(f, "NLD"),
      Language::ENG => write!(f, "ENG"),
      Language::FRA => write!(f, "FRA"),
      Language::DEU => write!(f, "DEU"),
      Language::HUN => write!(f, "HUN"),
      Language::ITA => write!(f, "ITA"),
      Language::JPN => write!(f, "JPN"),
      Language::KOR => write!(f, "KOR"),
      Language::PLK => write!(f, "PLK"),
      Language::PTB => write!(f, "PTB"),
      Language::ROM => write!(f, "ROM"),
      Language::RUS => write!(f, "RUS"),
      Language::ESP => write!(f, "ESP"),
      Language::TRK => write!(f, "TRK"),
      Language::UKR => write!(f, "UKR"),
      Language::VIN => write!(f, "VIN"),
    }
  }
}

#[derive(Error, Debug, Clone)]
#[error("Invalid language: {0}")]
pub struct InvalidLanguageError(String);

impl FromStr for Language {
  type Err = InvalidLanguageError;

  fn from_str(s: &str) -> Result<Self, Self::Err> {
    match s {
      "CHS" => Ok(Language::CHS),
      "CHT" => Ok(Language::CHT),
      "CSY" => Ok(Language::CSY),
      "NLD" => Ok(Language::NLD),
      "ENG" => Ok(Language::ENG),
      "FRA" => Ok(Language::FRA),
      "DEU" => Ok(Language::DEU),
      "HUN" => Ok(Language::HUN),
      "ITA" => Ok(Language::ITA),
      "JPN" => Ok(Language::JPN),
      "KOR" => Ok(Language::KOR),
      "PLK" => Ok(Language::PLK),
      "PTB" => Ok(Language::PTB),
      "ROM" => Ok(Language::ROM),
      "RUS" => Ok(Language::RUS),
      "ESP" => Ok(Language::ESP),
      "TRK" => Ok(Language::TRK),
      "UKR" => Ok(Language::UKR),
      "VIN" => Ok(Language::VIN),
      _ => Err(InvalidLanguageError(s.to_string())),
    }
  }
}

#[derive(Debug, Copy, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[allow(clippy::upper_case_acronyms)]
pub enum Detector {
  #[serde(rename = "default")]
  Default,
  #[serde(rename = "ctd")]
  CTD,
}

impl From<prisma::Detector> for Detector {
  fn from(detector: prisma::Detector) -> Self {
    match detector {
      prisma::Detector::Default => Detector::Default,
      prisma::Detector::Ctd => Detector::CTD,
    }
  }
}

impl From<Detector> for prisma::Detector {
  fn from(val: Detector) -> Self {
    match val {
      Detector::Default => prisma::Detector::Default,
      Detector::CTD => prisma::Detector::Ctd,
    }
  }
}

impl fmt::Display for Detector {
  fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
    match self {
      Detector::Default => write!(f, "default"),
      Detector::CTD => write!(f, "ctd"),
    }
  }
}

#[derive(Error, Debug, Clone)]
#[error("Invalid detector: {0}")]
pub struct InvalidDetectorError(String);

impl FromStr for Detector {
  type Err = InvalidDetectorError;

  fn from_str(s: &str) -> Result<Self, Self::Err> {
    match s {
      "default" => Ok(Detector::Default),
      "ctd" => Ok(Detector::CTD),
      _ => Err(InvalidDetectorError(s.to_string())),
    }
  }
}

#[derive(Debug, Copy, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum Direction {
  #[serde(rename = "default")]
  Default,
  #[serde(rename = "auto")]
  Auto,
  #[serde(rename = "horizontal")]
  Horizontal,
  #[serde(rename = "vertical")]
  Vertical,
}

impl From<prisma::Direction> for Direction {
  fn from(direction: prisma::Direction) -> Self {
    match direction {
      prisma::Direction::Auto => Direction::Auto,
      prisma::Direction::Horizontal => Direction::Horizontal,
      prisma::Direction::Vertical => Direction::Vertical,
    }
  }
}

#[derive(Error, Debug, Clone)]
pub enum DirectionIntoDBError {
  #[error("Direction needs to be specified")]
  NoDefault,
}

impl TryFrom<Direction> for prisma::Direction {
  type Error = DirectionIntoDBError;

  fn try_from(val: Direction) -> Result<Self, Self::Error> {
    match val {
      Direction::Auto => Ok(prisma::Direction::Auto),
      Direction::Horizontal => Ok(prisma::Direction::Horizontal),
      Direction::Vertical => Ok(prisma::Direction::Vertical),
      Direction::Default => Err(DirectionIntoDBError::NoDefault),
    }
  }
}

pub fn default_direction(lang: Language) -> Direction {
  match lang {
    Language::CHS => Direction::Auto,
    Language::CHT => Direction::Auto,
    Language::CSY => Direction::Horizontal,
    Language::NLD => Direction::Horizontal,
    Language::ENG => Direction::Horizontal,
    Language::FRA => Direction::Horizontal,
    Language::DEU => Direction::Horizontal,
    Language::HUN => Direction::Horizontal,
    Language::ITA => Direction::Horizontal,
    Language::JPN => Direction::Auto,
    Language::KOR => Direction::Auto,
    Language::PLK => Direction::Horizontal,
    Language::PTB => Direction::Horizontal,
    Language::ROM => Direction::Horizontal,
    Language::RUS => Direction::Horizontal,
    Language::ESP => Direction::Horizontal,
    Language::TRK => Direction::Horizontal,
    Language::UKR => Direction::Horizontal,
    Language::VIN => Direction::Horizontal,
  }
}

impl Direction {
  pub fn into_db(self, lang: Language) -> prisma::Direction {
    match self {
      Direction::Default => default_direction(lang).try_into().unwrap(),
      Direction::Auto => prisma::Direction::Auto,
      Direction::Horizontal => prisma::Direction::Horizontal,
      Direction::Vertical => prisma::Direction::Vertical,
    }
  }
}

impl fmt::Display for Direction {
  fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
    match self {
      Direction::Default => write!(f, "default"),
      Direction::Auto => write!(f, "auto"),
      Direction::Horizontal => write!(f, "h"),
      Direction::Vertical => write!(f, "v"),
    }
  }
}

#[derive(Error, Debug, Clone)]
#[error("Invalid direction: {0}")]
pub struct InvalidDirectionError(String);

impl FromStr for Direction {
  type Err = InvalidDirectionError;

  fn from_str(s: &str) -> Result<Self, Self::Err> {
    match s {
      "default" => Ok(Direction::Default),
      "auto" => Ok(Direction::Auto),
      "h" => Ok(Direction::Horizontal),
      "v" => Ok(Direction::Vertical),
      "horizontal" => Ok(Direction::Horizontal),
      "vertical" => Ok(Direction::Vertical),
      _ => Err(InvalidDirectionError(s.to_string())),
    }
  }
}

#[derive(Debug, Copy, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum Translator {
  #[serde(rename = "youdao")]
  Youdao,
  #[serde(rename = "baidu")]
  Baidu,
  #[serde(rename = "google")]
  Google,
  #[serde(rename = "deepl")]
  DeepL,
  #[serde(rename = "papago")]
  Papago,
  #[serde(rename = "offline")]
  Offline,
  #[serde(rename = "none")]
  None,
  #[serde(rename = "original")]
  Original,
}

impl From<prisma::Translator> for Translator {
  fn from(translator: prisma::Translator) -> Self {
    match translator {
      prisma::Translator::Youdao => Translator::Youdao,
      prisma::Translator::Baidu => Translator::Baidu,
      prisma::Translator::Google => Translator::Google,
      prisma::Translator::Deepl => Translator::DeepL,
      prisma::Translator::Papago => Translator::Papago,
      prisma::Translator::Offline => Translator::Offline,
      prisma::Translator::None => Translator::None,
      prisma::Translator::Original => Translator::Original,
    }
  }
}

impl From<Translator> for prisma::Translator {
  fn from(val: Translator) -> Self {
    match val {
      Translator::Youdao => prisma::Translator::Youdao,
      Translator::Baidu => prisma::Translator::Baidu,
      Translator::Google => prisma::Translator::Google,
      Translator::DeepL => prisma::Translator::Deepl,
      Translator::Papago => prisma::Translator::Papago,
      Translator::Offline => prisma::Translator::Offline,
      Translator::None => prisma::Translator::None,
      Translator::Original => prisma::Translator::Original,
    }
  }
}

impl fmt::Display for Translator {
  fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
    match self {
      Translator::Youdao => write!(f, "youdao"),
      Translator::Baidu => write!(f, "baidu"),
      Translator::Google => write!(f, "google"),
      Translator::DeepL => write!(f, "deepl"),
      Translator::Papago => write!(f, "papago"),
      Translator::Offline => write!(f, "offline"),
      Translator::None => write!(f, "none"),
      Translator::Original => write!(f, "original"),
    }
  }
}

#[derive(Error, Debug, Clone)]
#[error("Invalid translator: {0}")]
pub struct InvalidTranslatorError(String);

impl FromStr for Translator {
  type Err = InvalidTranslatorError;

  fn from_str(s: &str) -> Result<Self, Self::Err> {
    match s {
      "youdao" => Ok(Translator::Youdao),
      "baidu" => Ok(Translator::Baidu),
      "google" => Ok(Translator::Google),
      "deepl" => Ok(Translator::DeepL),
      "papago" => Ok(Translator::Papago),
      "offline" => Ok(Translator::Offline),
      "none" => Ok(Translator::None),
      "original" => Ok(Translator::Original),
      _ => Err(InvalidTranslatorError(s.to_string())),
    }
  }
}

#[derive(Debug, Copy, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum Size {
  S,
  M,
  L,
  X,
}

impl From<prisma::Size> for Size {
  fn from(size: prisma::Size) -> Self {
    match size {
      prisma::Size::S => Size::S,
      prisma::Size::M => Size::M,
      prisma::Size::L => Size::L,
      prisma::Size::X => Size::X,
    }
  }
}

impl From<Size> for prisma::Size {
  fn from(val: Size) -> Self {
    match val {
      Size::S => prisma::Size::S,
      Size::M => prisma::Size::M,
      Size::L => prisma::Size::L,
      Size::X => prisma::Size::X,
    }
  }
}

impl fmt::Display for Size {
  fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
    match self {
      Size::S => write!(f, "S"),
      Size::M => write!(f, "M"),
      Size::L => write!(f, "L"),
      Size::X => write!(f, "X"),
    }
  }
}

#[derive(Error, Debug, Clone)]
#[error("Invalid size: {0}")]
pub struct InvalidSizeError(String);

impl FromStr for Size {
  type Err = InvalidSizeError;

  fn from_str(s: &str) -> Result<Self, Self::Err> {
    match s {
      "S" => Ok(Size::S),
      "M" => Ok(Size::M),
      "L" => Ok(Size::L),
      "X" => Ok(Size::X),
      _ => Err(InvalidSizeError(s.to_string())),
    }
  }
}

#[derive(Debug, Copy, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum TaskState {
  #[serde(rename = "pending")]
  Pending,
  #[serde(rename = "running")]
  Running,
  #[serde(rename = "done")]
  Done,
  #[serde(rename = "error")]
  Error,
}

impl From<prisma::TaskState> for TaskState {
  fn from(state: prisma::TaskState) -> Self {
    match state {
      prisma::TaskState::Pending => TaskState::Pending,
      prisma::TaskState::Running => TaskState::Running,
      prisma::TaskState::Done => TaskState::Done,
      prisma::TaskState::Error => TaskState::Error,
    }
  }
}

impl From<TaskState> for prisma::TaskState {
  fn from(val: TaskState) -> Self {
    match val {
      TaskState::Pending => prisma::TaskState::Pending,
      TaskState::Running => prisma::TaskState::Running,
      TaskState::Done => prisma::TaskState::Done,
      TaskState::Error => prisma::TaskState::Error,
    }
  }
}

impl fmt::Display for TaskState {
  fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
    match self {
      TaskState::Pending => write!(f, "pending"),
      TaskState::Running => write!(f, "running"),
      TaskState::Done => write!(f, "done"),
      TaskState::Error => write!(f, "error"),
    }
  }
}
