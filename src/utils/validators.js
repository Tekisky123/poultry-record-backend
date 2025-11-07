import validator from 'validator';
import AppError from './AppError.js';

export const signupValidator = (data = {}) => {
  if (!data || typeof data !== 'object') {
    throw new AppError('Invalid request body', 400);
  }

  const { name, role, email, mobileNumber, age, password, address, gstOrPanNumber, area } = data;

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

  // 8. GST/PAN validation for customers
  if (role === 'customer') {
    if (!gstOrPanNumber || typeof gstOrPanNumber !== 'string' || !gstOrPanNumber.trim()) {
      throw new AppError('GST/PAN number is required for customer registration', 400);
    }
    
    const gstPanValue = gstOrPanNumber.trim();
    // Basic length validation - GST is 15 chars, PAN is 10 chars
    if (gstPanValue.length < 10 || gstPanValue.length > 15) {
      throw new AppError('GST/PAN number must be between 10-15 characters', 400);
    }
    
    // Optional: Enhanced validation for GST/PAN format
    // GST format: 2 chars state code + 10 chars PAN + 1 char entity + 1 char Z + 1 char checksum
    // PAN format: 5 chars + 4 chars + 1 char
    if (gstPanValue.length === 15) {
      // GST validation - basic format check
      if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}[Z]{1}[0-9A-Z]{1}$/.test(gstPanValue)) {
        throw new AppError('Invalid GST number format', 400);
      }
    } else if (gstPanValue.length === 10) {
      // PAN validation - basic format check
      if (!/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(gstPanValue)) {
        throw new AppError('Invalid PAN number format', 400);
      }
    }

    // 9. Area validation for customers
    if (!area || typeof area !== 'string' || !area.trim()) {
      throw new AppError('Area is required for customer registration', 400);
    }
    
    const areaValue = area.trim();
    if (areaValue.length > 100) {
      throw new AppError('Area name cannot exceed 100 characters', 400);
    }
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