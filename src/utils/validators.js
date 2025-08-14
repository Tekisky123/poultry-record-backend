import validator from 'validator';
import AppError from './AppError.js';

export const signupValidator = (data) => {
    const { firstName, lastName, emailId, password } = data;
    if (!firstName || !lastName) {
        throw new AppError("Name is not valid", 400);
    } else if (!validator.isEmail(emailId)) {
        throw new AppError("Email is not valid", 400);
    } else if (!validator.isStrongPassword(password)) {
        throw new AppError('Please enter a strong password', 400);
    }
}

export const loginValidator = (data) => {
  const { mobile, password } = data;

  if (!mobile || !validator.isMobilePhone(mobile.toString(), "any")) {
    throw new AppError("Mobile number is not valid", 400);
  }
  if (!password) {
    throw new AppError("Password is required", 400);
  }
  if (!validator.isStrongPassword(password)) {
    throw new AppError("Password is invalid!", 400);
  }
};