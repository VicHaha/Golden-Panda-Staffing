// ============================================================
// Cloudinary — stock photo hosting, deliberately NOT Supabase Storage
// (Supabase's free tier only gives 500MB; Cloudinary's free tier gives
// 25 credits/month, where 1 credit = 1GB storage/bandwidth — plenty for
// product photos, and separate from anything counted against Supabase).
//
// Uses an "unsigned upload preset", which is Cloudinary's supported way
// to accept uploads directly from a browser with no backend server and
// no secret key exposed in client code — only the cloud name and preset
// name are needed, and both are safe to be public.
//
// SETUP REQUIRED (one-time, free):
// 1. Create a free account at https://cloudinary.com
// 2. Dashboard shows your "Cloud name" at the top — copy it below.
// 3. Settings → Upload → Upload presets → Add upload preset.
//    Set "Signing Mode" to "Unsigned". Copy the preset name below.
// ============================================================
const CLOUDINARY_CLOUD_NAME = "REPLACE_WITH_YOUR_CLOUD_NAME";
const CLOUDINARY_UPLOAD_PRESET = "REPLACE_WITH_YOUR_UNSIGNED_PRESET";

const CLOUDINARY_CONFIGURED = CLOUDINARY_CLOUD_NAME !== "REPLACE_WITH_YOUR_CLOUD_NAME";

// Uploads an image blob to Cloudinary and returns its hosted URL.
async function uploadPhotoToCloudinary(blob){
  if(!CLOUDINARY_CONFIGURED){
    throw new Error('Photo upload is not set up yet — see js/cloudinary.js for setup steps.');
  }
  const formData = new FormData();
  formData.append('file', blob);
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
    method: 'POST',
    body: formData
  });
  const data = await response.json();
  if(!response.ok){
    throw new Error(data.error?.message || 'Photo upload failed');
  }
  return data.secure_url;
}
