import axios from 'axios';
import Setting from '../models/Setting.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const smsTemplates = require('./smsTemplates.json');


/**
 * Send SMS using Fast2SMS API
 * @param {string|Object} template_nameOrPayload - Template Name OR raw payload object
 * @param {string|string[]} [variables_values] - Values for template variables
 * @param {string|string[]} [numbers] - Single phone number or array of numbers
 * @returns {Promise<Object>} Response data from Fast2SMS
 */
const sendSMS = async (template_nameOrPayload, variables_values, numbers) => {
    try {
        // Check DB setting first
        const smsSetting = await Setting.findOne({ key: 'SMS_ENABLED' }).catch(() => null);

        // If DB setting exists, use its value. If not, fallback to env var (legacy support)
        const isEnabled = smsSetting ? smsSetting.value === true : process.env.ENABLE_SMS_SERVICE === 'true';

        if (!isEnabled) {
            console.log('SMS Service is disabled (DB/Env). Skipping SMS sending.');
            return null;
        }

        const apiKey = process.env.FAST2SMS_API_KEY;

        if (!apiKey) {
            console.error('FAST2SMS_API_KEY is missing in environment variables');
            return null;
        }

        let payload;

        if (typeof template_nameOrPayload === 'object' && template_nameOrPayload !== null) {
            payload = template_nameOrPayload;
        } else {
            const templateName = template_nameOrPayload;
            const template = smsTemplates.find(t => t.template_name === templateName);
            
            if (!template) {
                console.error(`SMS Template '${templateName}' not found in smsTemplates.json`);
                return null;
            }

            const cleanNumbers = Array.isArray(numbers) 
                ? numbers.map(n => String(n).replace(/\D/g, '').slice(-10)).join(',') 
                : String(numbers || '').replace(/\D/g, '').slice(-10);

            const formattedVariables = Array.isArray(variables_values)
                ? variables_values.join('|')
                : (variables_values || '');

            payload = {
                route: template.route || "dlt",
                sender_id: template.sender_id || "TEKSKY",
                message: template.template_id,
                variables_values: formattedVariables,
                numbers: cleanNumbers,
                flash: template.flash || 0
            };
        }

        console.log("Sending SMS Payload:", payload);

        const response = await axios.post('https://www.fast2sms.com/dev/bulkV2', payload, {
            headers: {
                "authorization": apiKey,
                "Content-Type": "application/json"
            }
        });
        console.log("SMS Response:", response.data);
        return response.data;
    } catch (error) {
        console.error('Fast2SMS Error:', error.response?.data || error.message);
        return null;
    }
};

export default sendSMS;


