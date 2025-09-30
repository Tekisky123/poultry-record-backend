import validator from 'validator';
import AppError from './AppError.js';

export const signupValidator = (data = {}) => {
  if (!data || typeof data !== 'object') {
    throw new AppError('Invalid request body', 400);
  }

  const { name, role, email, mobileNumber, age, password, address } = data;

  // 1. Name validation
  if (!name || typeof name !== 'string' || name.trim().length < 3 || name.trim().length > 50) {
    throw new AppError('Name must be between 3 and 50 characters', 400);
  }

  // 2. Role validation
  const allowedRoles = ['superadmin', 'admin', 'supervisor', 'customer'];
  if (!role || !allowedRoles.includes(role)) {
    throw new AppError(`Role must be one of: ${allowedRoles.join(', ')}`, 400);
  }

  // 3. Email validation required 
  if (!email || !validator.isEmail(email)) {
    throw new AppError('Invalid email!', 400);
  }

  // 4. Mobile number validation
  if (!mobileNumber || !validator.isMobilePhone(mobileNumber.toString(), 'any', { strictMode: true })) {
    throw new AppError('Invalid mobile number', 400);
  }

  // 5. Age validation (optional, but if provided must be within range)
  if (age !== undefined) {
    if (typeof age !== 'number' || age < 18 || age > 100) {
      throw new AppError('Age must be a number between 18 and 100', 400);
    }
  }

  // 6. Password validation (min 6 chars, at least one uppercase, lowercase, number)
  if (!password || typeof password !== 'string') {
    throw new AppError('Password is required', 400);
  }
  if (!validator.isStrongPassword(password, {
    minLength: 6,
    minLowercase: 1,
    minUppercase: 1,
    minNumbers: 1,
    minSymbols: 0 // match schema config — no special char required
  })) {
    throw new AppError('Password must contain at least one uppercase letter, one lowercase letter, and one number', 400);
  }

  // 7. Address validation (optional, max 200 chars)
  if (address && address.length > 200) {
    throw new AppError('Address cannot exceed 200 characters', 400);
  }

  return true; // passes all checks
};

export const loginValidator = (data = {}) => {
  if (!data || typeof data !== 'object') {
    throw new AppError('Invalid request body', 400);
  }

  const { username, password } = data;

  // Validation logic
  if (!username) {
    throw new AppError("Username is required", 400);
  }

  // Check if it's an email
  if (validator.isEmail(username)) {
    console.log("user login with email");
  }
  // Check if it's a mobile number
  else if (validator.isMobilePhone(username.toString(), "any", { strictMode: true })) {
    console.log("user login with mobile number");
  }
  // Otherwise invalid
  else {
    throw new AppError("Username must be a valid email or mobile number", 400);
  }

  // Password validation
  if (!password || typeof password !== 'string') {
    throw new AppError('Password is required', 400);
  }

  if (!validator.isStrongPassword(password, {
    minLength: 6,
    minLowercase: 1,
    minUppercase: 1,
    minNumbers: 1,
    minSymbols: 0 // match schema rules
  })) {
    throw new AppError('Password must contain at least one uppercase letter, one lowercase letter, and one number', 400);
  }

  return true;
};