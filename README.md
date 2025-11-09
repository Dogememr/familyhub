# FamilyHub

FamilyHub is a comprehensive personal planning and study companion web application designed to help users organize their daily tasks, receive study assistance, and track nutrition information. Built with vanilla HTML, CSS, and JavaScript for the frontend, and Node.js/Express for backend email verification, it uses localStorage for data persistence and includes an anti-spam email verification system.

## Features

### 🔐 Authentication System
- **User Registration**: Create an account with username, email, and password
- **Email Verification**: Anti-spam email verification system that sends a 6-digit code to verify email addresses
- **Secure Login**: Access your personalized dashboard
- **Session Management**: Automatic session persistence using localStorage
- **Password Protection**: Basic password encoding (note: for production, implement proper encryption)

### 📅 Day Planner
- **Task Management**: Add, edit, and delete daily tasks
- **Time-based Scheduling**: Assign specific times to tasks
- **Priority Levels**: Categorize tasks as Low, Medium, or High priority
- **Date Navigation**: Plan tasks for any date
- **Planning Tips**: Built-in guidance on effective planning strategies
- **Persistent Storage**: All tasks saved locally per user and date

### 🤖 Study Chatbot
- **Interactive Assistant**: Get help with homework and studying
- **Subject Support**: Assistance with math, science, and general academic topics
- **Study Tips**: Receive personalized study strategies and techniques
- **Motivation**: Encouragement and advice when facing challenges
- **Real-time Chat**: Instant responses powered by Google Gemini (serverless proxy)

### 🥗 Nutrition Lookup
- **Food Database**: Search for nutritional information on common foods
- **Comprehensive Data**: View calories, protein, carbs, fat, and fiber content
- **Easy Search**: Quick lookup of food items and their nutritional values
- **Per-serving Information**: Nutritional data displayed per 100g serving

## Technology Stack

- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **Backend**: Node.js, Express.js
- **Email Service**: Nodemailer (supports Gmail, SendGrid, Mailgun, and other SMTP providers)
- **Storage**: localStorage API
- **AI Integration**: Google Gemini API (via Vercel serverless function)
- **Styling**: Modern CSS with gradients, animations, and responsive design
- **Architecture**: Single Page Application (SPA) with page routing


## Project Structure

```
FamilyHub/
├── index.html          # Login/Signup page with email verification
├── dashboard.html      # Main application dashboard
├── styles.css          # Global styles and component styling
├── auth.js             # Authentication logic with email verification
├── dashboard.js        # Dashboard functionality (planner, chatbot, nutrition)
├── server.js           # Backend Express server for email verification
├── package.json        # Node.js dependencies
├── .env.example        # Example environment variables (create .env from this)
├── .gitignore          # Git ignore file
├── EMAIL_SETUP.md      # Detailed email configuration guide
└── README.md           # This file
```

## How It Works

FamilyHub provides a seamless experience for users to manage their daily activities. Users create an account with email verification to prevent spam signups. Once verified, they can access the dashboard to plan their day with time-based tasks, get study help from the interactive chatbot, and look up nutritional information for various foods. All data is stored locally in the browser, ensuring privacy and offline functionality.

## Possible Next Steps & Enhancements

### 🔒 Security Improvements
- [ ] Implement proper password hashing (bcrypt, Argon2)
- [ ] Add password strength validation
- [ ] Implement session tokens with expiration
- [x] Add email verification for account creation ✅
- [ ] Include password reset functionality
- [ ] Add rate limiting for login attempts and email sending
- [ ] Implement CAPTCHA to prevent bot signups
- [ ] Add email verification expiration reminders

### 📱 Enhanced Features
- [ ] Add task categories and tags
- [ ] Implement task reminders and notifications
- [ ] Add task completion tracking and statistics
- [ ] Create weekly and monthly calendar views
- [ ] Add task templates for recurring activities
- [ ] Implement task sharing between users
- [ ] Add dark mode support

### 🤖 Chatbot Improvements
- [ ] Add conversation history persistence
- [ ] Implement subject-specific chatbots (math tutor, science tutor)
- [ ] Add file upload capability for homework help
- [ ] Create saved conversation threads
- [ ] Add voice input support

### 🥗 Nutrition Enhancements
- [ ] Integrate with nutrition APIs (Edamam, Nutritionix, USDA FoodData Central)
- [ ] Add barcode scanning for food items
- [ ] Implement meal planning and recipe suggestions
- [ ] Add daily calorie tracking
- [ ] Create nutrition goals and progress tracking
- [ ] Add meal logging with timestamps
- [ ] Implement macro nutrient tracking

### 🎨 UI/UX Improvements
- [ ] Add animations and transitions
- [ ] Implement drag-and-drop for task reordering
- [ ] Add keyboard shortcuts
- [ ] Create mobile-responsive design optimization
- [ ] Add data visualization charts (task completion, nutrition trends)
- [ ] Implement customizable themes
- [ ] Add accessibility features (ARIA labels, screen reader support)

### 💾 Data Management
- [ ] Add data export functionality (JSON, CSV)
- [ ] Implement data import from other planners
- [ ] Add cloud sync capability (Firebase, Supabase)
- [ ] Create data backup and restore features
- [ ] Add data encryption for sensitive information

### 🧪 Testing & Quality
- [ ] Add unit tests for core functionality
- [ ] Implement integration tests
- [ ] Add end-to-end testing
- [ ] Create comprehensive error handling
- [ ] Add input validation and sanitization
- [ ] Implement logging and error tracking

### 📚 Documentation
- [ ] Create user guide with screenshots
- [ ] Add API documentation (if backend is added)
- [ ] Create developer contribution guide
- [ ] Add code comments and JSDoc

## Concerns & Considerations

### ⚠️ Security Concerns
1. **Password Storage**: Currently using base64 encoding, which is NOT secure. For production:
   - Implement proper password hashing (bcrypt, Argon2)
   - Never store passwords in plain text or simple encoding
   - Consider using a backend service for authentication

2. **Email Verification**:
   - Verification codes are stored in memory and expire after 10 minutes
   - For production, consider using Redis or a database for code storage
   - Implement rate limiting to prevent email spam
   - Add email sending queue for high-volume scenarios

3. **SMTP Credentials**: 
   - Never commit `.env` file with real credentials to version control
   - Use environment variables for all sensitive data
   - Consider using email service APIs (SendGrid, Mailgun) with API keys instead of SMTP passwords
   - Rotate credentials regularly

4. **Data Privacy**: All data is stored locally in localStorage:
   - Data is not encrypted by default
   - Consider adding encryption for sensitive data
   - Users should be aware that clearing browser data will delete all information

5. **XSS Vulnerabilities**: Ensure all user inputs are sanitized:
   - Currently using `textContent` which helps, but additional sanitization may be needed
   - Consider using a library like DOMPurify for HTML content

### 🔄 Scalability Concerns
1. **localStorage Limitations**: 
   - Limited to ~5-10MB per domain
   - May fill up with extensive task history
   - Consider implementing data cleanup/archival strategies

2. **Performance**: 
   - Large datasets may slow down the application
   - Consider implementing pagination for task lists
   - Add lazy loading for better performance

### 🌐 Browser Compatibility
1. **localStorage Support**: 
   - Available in all modern browsers
   - May not work in private/incognito mode on some browsers
   - Consider adding fallback storage mechanisms

2. **Feature Detection**: 
   - Add checks for localStorage availability
   - Implement graceful degradation for older browsers

### 📊 Data Loss Risk
1. **No Backup**: 
   - Data is stored only in browser localStorage
   - Clearing browser data will delete all information
   - Consider implementing export/import functionality
   - Add cloud sync option for data backup

2. **Multiple Devices**: 
   - Data doesn't sync across devices
   - Users need separate accounts per device
   - Cloud sync would solve this issue

### 🔌 API Integration
1. **Email Service**: 
   - Currently configured for SMTP (Gmail, etc.)
   - Consider using dedicated email APIs (SendGrid, Mailgun, AWS SES) for better deliverability
   - Implement email templates and tracking
   - Add email bounce and complaint handling

2. **Nutrition API**: 
   - Current implementation uses a limited hardcoded database
   - Production version should integrate with real nutrition APIs
   - Consider API rate limits and costs
   - Need API key management strategy

3. **Chatbot API**: 
   - Currently proxies to Google Gemini models (default `models/gemini-2.5-flash`)
   - Monitor API usage, rate limits, and billing
   - Implement conversation context management
   - Consider fallbacks if the API key is missing or rate-limited

### 🎯 User Experience
1. **Offline Functionality**: 
   - Application works offline (good!)
   - Consider adding service workers for better offline experience
   - Add visual indicators for offline mode

2. **Error Handling**: 
   - Add better error messages for users
   - Implement retry mechanisms for failed operations
   - Add user-friendly error recovery options

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

## License

This project is open source and available under the MIT License.

## Support

For issues, questions, or suggestions, please open an issue on the GitHub repository.

---

**Note**: This application uses localStorage for data persistence and includes a backend server for email verification. For production use, consider implementing proper password hashing, database storage, and enhanced security measures for scalability.



