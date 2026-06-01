export const MIN_REGISTER_AGE = 14;
const MAX_REGISTER_AGE = 120;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;
const PHONE_PATTERN = /^0\d{9}$/;
const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{6,50}$/;

export const normalizeEmail = (rawEmail) =>
  String(rawEmail || "").trim().toLowerCase();

export const normalizePhone = (rawPhone) =>
  String(rawPhone || "").trim().replace(/\s+/g, "");

export const validateRegistrationEmail = (
  rawEmail,
  requiredMessage = "Vui lòng nhập email.",
) => {
  const normalizedEmail = normalizeEmail(rawEmail);

  if (!normalizedEmail) {
    return requiredMessage;
  }

  if (!EMAIL_PATTERN.test(normalizedEmail)) {
    return "Email không đúng định dạng.";
  }

  return "";
};

const parseBirthDate = (rawDob) => {
  const value = String(rawDob || "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, monthIndex, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== monthIndex ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
};

const getAge = (birthDate, today) => {
  let age = today.getFullYear() - birthDate.getFullYear();
  const hasBirthdayPassed =
    today.getMonth() > birthDate.getMonth() ||
    (today.getMonth() === birthDate.getMonth() &&
      today.getDate() >= birthDate.getDate());

  if (!hasBirthdayPassed) {
    age -= 1;
  }

  return age;
};

export const validateRegistrationFields = ({
  phone,
  password,
  confirmPassword,
  firstName,
  lastName,
  dob,
  gender,
}) => {
  const normalizedPhone = normalizePhone(phone);

  if (
    !String(firstName || "").trim() ||
    !String(lastName || "").trim() ||
    !normalizedPhone ||
    !String(dob || "").trim() ||
    !String(gender || "").trim() ||
    !password ||
    !confirmPassword
  ) {
    return "Vui lòng nhập đầy đủ thông tin đăng ký.";
  }

  if (!PHONE_PATTERN.test(normalizedPhone)) {
    return "Số điện thoại phải gồm 10 chữ số và bắt đầu bằng 0.";
  }

  const birthDate = parseBirthDate(dob);
  if (!birthDate) {
    return "Ngày sinh không hợp lệ.";
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (birthDate > today) {
    return "Ngày sinh không được lớn hơn ngày hiện tại.";
  }

  const age = getAge(birthDate, today);
  if (age < MIN_REGISTER_AGE) {
    return `Bạn phải từ ${MIN_REGISTER_AGE} tuổi trở lên để đăng ký.`;
  }

  if (age > MAX_REGISTER_AGE) {
    return "Ngày sinh không hợp lệ.";
  }

  if (!PASSWORD_PATTERN.test(password)) {
    return "Mật khẩu phải dài 6-50 ký tự và có chữ hoa, chữ thường, số.";
  }

  if (password !== confirmPassword) {
    return "Mật khẩu xác nhận không khớp.";
  }

  return "";
};

export const isDuplicatePhoneError = (message) =>
  /phone|số điện thoại/i.test(String(message || ""));

export const toRegistrationErrorMessage = (message, fallbackMessage) => {
  const rawMessage = String(message || "").trim();

  if (!rawMessage) {
    return fallbackMessage;
  }

  if (/invalid email|email.*invalid|email.*format/i.test(rawMessage)) {
    return "Email không đúng định dạng.";
  }

  if (/email.*already|already.*email|email.*registered/i.test(rawMessage)) {
    return "Email đã tồn tại. Vui lòng đăng nhập.";
  }

  if (/phone.*already|already.*phone|phone.*registered/i.test(rawMessage)) {
    return "Số điện thoại đã được đăng ký. Vui lòng dùng số khác.";
  }

  if (/phone.*10|starting with 0|phone.*invalid/i.test(rawMessage)) {
    return "Số điện thoại phải gồm 10 chữ số và bắt đầu bằng 0.";
  }

  if (/password.*6-50|uppercase|lowercase|numbers/i.test(rawMessage)) {
    return "Mật khẩu phải dài 6-50 ký tự và có chữ hoa, chữ thường, số.";
  }

  if (/date of birth|dob/i.test(rawMessage)) {
    return "Ngày sinh không hợp lệ.";
  }

  return rawMessage || fallbackMessage;
};
