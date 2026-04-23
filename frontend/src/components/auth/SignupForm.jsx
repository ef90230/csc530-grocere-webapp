import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const roleOptions = [
  { value: 'manager', label: 'Manager' },
  { value: 'picker', label: 'Picker' },
  { value: 'stager', label: 'Stager' },
  { value: 'dispenser', label: 'Dispenser' }
];

const signupSchema = z.object({
  userType: z.enum(['customer', 'employee', 'admin']),
  employeeId: z.string().optional(),
  customerId: z.string().optional(),
  firstName: z
    .string()
    .min(1, 'First name is required')
    .min(2, 'First name must be at least 2 characters'),
  lastName: z
    .string()
    .min(1, 'Last name is required')
    .min(2, 'Last name must be at least 2 characters'),
  email: z
    .string()
    .min(1, 'Email is required')
    .email('Please enter a valid email address'),
  phone: z.string().optional(),
  password: z
    .string()
    .min(1, 'Password is required')
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[!@#$%^&*(),.?":{}|<>]/, 'Password must contain at least one special character'),
  confirmPassword: z.string().min(1, 'Please confirm your password'),
  preferredStoreId: z.string().optional(),
  storeId: z.string().optional(),
  role: z.string().optional()
}).superRefine((data, ctx) => {
  if (data.password !== data.confirmPassword) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Passwords do not match',
      path: ['confirmPassword']
    });
  }

  if (data.userType === 'customer') {
    if (!data.customerId || !data.customerId.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Customer ID is required',
        path: ['customerId']
      });
    } else if (!/^[a-zA-Z0-9]+$/.test(data.customerId.trim())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Customer ID must be alphanumeric',
        path: ['customerId']
      });
    }

    if (!data.phone || !data.phone.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Phone is required',
        path: ['phone']
      });
    } else if (!/^\+?[1-9]\d{1,14}$/.test(data.phone.trim())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Please provide a valid phone number',
        path: ['phone']
      });
    }

    if (!data.preferredStoreId || !data.preferredStoreId.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Store selection is required',
        path: ['preferredStoreId']
      });
    } else if (!/^\d+$/.test(data.preferredStoreId.trim())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Store ID must be numeric',
        path: ['preferredStoreId']
      });
    }
  }

  if (data.userType === 'employee') {
    if (!data.employeeId || !data.employeeId.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Employee ID is required',
        path: ['employeeId']
      });
    } else if (!/^[a-zA-Z0-9]+$/.test(data.employeeId.trim())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Employee ID must be alphanumeric',
        path: ['employeeId']
      });
    }

    if (!data.storeId || !data.storeId.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Store selection is required',
        path: ['storeId']
      });
    } else if (!/^\d+$/.test(data.storeId.trim())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Store ID must be numeric',
        path: ['storeId']
      });
    }

    if (!data.role || !['manager', 'picker', 'stager', 'dispenser'].includes(data.role)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Role is required',
        path: ['role']
      });
    }
  }

  if (data.userType === 'admin') {
    if (!data.employeeId || !data.employeeId.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Employee ID is required',
        path: ['employeeId']
      });
    } else if (!/^[a-zA-Z0-9]+$/.test(data.employeeId.trim())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Employee ID must be alphanumeric',
        path: ['employeeId']
      });
    }

    if (!data.storeId || !data.storeId.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Store number is required',
        path: ['storeId']
      });
    } else if (!/^\d+$/.test(data.storeId.trim())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Store number must be numeric',
        path: ['storeId']
      });
    }
  }
});

const SignupForm = ({ onSubmit }) => {
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting }
  } = useForm({
    resolver: zodResolver(signupSchema),
    mode: 'onSubmit',
    defaultValues: {
      userType: 'customer',
      role: 'picker'
    }
  });

  const userType = watch('userType');

  const submitHandler = (formData) => {
    const basePayload = {
      userType: formData.userType,
      firstName: formData.firstName,
      lastName: formData.lastName,
      email: formData.email,
      password: formData.password
    };

    if (formData.userType === 'customer') {
      return onSubmit({
        ...basePayload,
        customerId: formData.customerId,
        phone: formData.phone,
        preferredStoreId: formData.preferredStoreId
      });
    }

    if (formData.userType === 'employee') {
      return onSubmit({
        ...basePayload,
        employeeId: formData.employeeId,
        storeId: formData.storeId,
        role: formData.role
      });
    }

    return onSubmit({
      ...basePayload,
      employeeId: formData.employeeId,
      storeId: formData.storeId
    });
  };

  return (
    <form onSubmit={handleSubmit(submitHandler)} className="signup-form">
      <div className="signup-form-group">
        <label className="signup-form-label" htmlFor="userType">User Role</label>
        <select id="userType" {...register('userType')}>
          <option value="customer">Customer</option>
          <option value="employee">Employee</option>
          <option value="admin">Admin</option>
        </select>
        {errors.userType && <span className="error-text">{errors.userType.message}</span>}
      </div>

      <h3 className="signup-form-section-title">User Information</h3>

      <div className="signup-form-row">
        <div className="signup-form-group">
          <label className="signup-form-sr-only" htmlFor="firstName">First name</label>
          <input id="firstName" placeholder="First name" {...register('firstName')} />
          {errors.firstName && <span className="error-text">{errors.firstName.message}</span>}
        </div>
        <div className="signup-form-group">
          <label className="signup-form-sr-only" htmlFor="lastName">Last name</label>
          <input id="lastName" placeholder="Last name" {...register('lastName')} />
          {errors.lastName && <span className="error-text">{errors.lastName.message}</span>}
        </div>
      </div>

      <div className="signup-form-group">
        <label className="signup-form-sr-only" htmlFor="email">Email</label>
        <input id="email" type="email" placeholder="Email" {...register('email')} />
        {errors.email && <span className="error-text">{errors.email.message}</span>}
      </div>

      {userType === 'customer' ? (
        <div className="signup-form-group">
          <label className="signup-form-sr-only" htmlFor="customerId">Customer ID</label>
          <input id="customerId" placeholder="Customer ID" {...register('customerId')} />
          {errors.customerId && <span className="error-text">{errors.customerId.message}</span>}
        </div>
      ) : null}

      {(userType === 'employee' || userType === 'admin') ? (
        <div className="signup-form-group">
          <label className="signup-form-sr-only" htmlFor="employeeId">Employee ID</label>
          <input id="employeeId" placeholder="Employee ID" {...register('employeeId')} />
          {errors.employeeId && <span className="error-text">{errors.employeeId.message}</span>}
        </div>
      ) : null}

      {userType === 'customer' ? (
        <div className="signup-form-group">
          <label className="signup-form-sr-only" htmlFor="phone">Phone number</label>
          <input id="phone" placeholder="Phone number" {...register('phone')} />
          {errors.phone && <span className="error-text">{errors.phone.message}</span>}
        </div>
      ) : null}

      <div className="signup-form-group">
        <label className="signup-form-sr-only" htmlFor="password">Password</label>
        <input id="password" type="password" placeholder="Password" {...register('password')} />
        {errors.password && <span className="error-text">{errors.password.message}</span>}
      </div>

      <div className="signup-form-group">
        <label className="signup-form-sr-only" htmlFor="confirmPassword">Confirm password</label>
        <input id="confirmPassword" type="password" placeholder="Confirm password" {...register('confirmPassword')} />
        {errors.confirmPassword && <span className="error-text">{errors.confirmPassword.message}</span>}
      </div>

      <label className="signup-form-field-label" htmlFor={userType === 'customer' ? 'preferredStoreId' : 'storeId'}>Store ID</label>
      <div className="signup-form-group">
        <label className="signup-form-sr-only" htmlFor={userType === 'customer' ? 'preferredStoreId' : 'storeId'}>Store ID</label>
        {userType === 'customer' ? (
          <input id="preferredStoreId" placeholder="Store ID" {...register('preferredStoreId')} />
        ) : (
          <input id="storeId" placeholder="Store ID" {...register('storeId')} />
        )}
        {errors.preferredStoreId && <span className="error-text">{errors.preferredStoreId.message}</span>}
        {errors.storeId && <span className="error-text">{errors.storeId.message}</span>}
      </div>

      {userType === 'employee' ? (
        <>
          <label className="signup-form-field-label" htmlFor="role">Role</label>
          <div className="signup-form-group">
            <label className="signup-form-sr-only" htmlFor="role">Role</label>
            <select id="role" {...register('role')}>
              {roleOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            {errors.role && <span className="error-text">{errors.role.message}</span>}
          </div>
        </>
      ) : null}

      <button type="submit" className="signup-form-submit" disabled={isSubmitting}>
        {isSubmitting ? 'SIGNING UP...' : 'SIGN UP'}
      </button>
    </form>
  );
};

export default SignupForm;
