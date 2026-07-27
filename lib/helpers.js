export function validPassword(p) {
  return typeof p === "string" && p.length >= 6 && /\d/.test(p);
}

export function validEmail(e) {
  return /^\S+@\S+\.\S+$/.test(e);
}

export function validPhone(p) {
  return /^\+?\d{7,15}$/.test((p || "").replace(/[\s-]/g, ""));
}

export function normTag(tag) {
  let t = (tag || "").trim().toUpperCase().replace(/O/g, "0");
  if (!t.startsWith("#")) t = "#" + t;
  return t;
}

export function validTag(tag) {
  return /^#[0289PYLQGRJCUV]{3,12}$/.test(normTag(tag));
}

export function waLink(contact) {
  const digits = (contact || "").replace(/\D/g, "");
  if (digits.length < 7) return null;
  let intl = digits;
  if (digits.startsWith("0")) intl = "961" + digits.slice(1);
  return `https://wa.me/${intl}`;
}

/* Compress an uploaded image (screenshot / battle QR) to a small JPEG
   so it fits comfortably in storage while QR codes stay scannable. */
export function compressImage(file, maxSide = 1000, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => resolve(blob), "image/jpeg", quality);
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function roundName(tr, roundIdx, totalRounds) {
  const remaining = totalRounds - roundIdx;
  if (remaining === 1) return tr("r_final");
  if (remaining === 2) return tr("r_semis");
  if (remaining === 3) return tr("r_quarters");
  return tr("r_of", Math.pow(2, remaining));
}

export function seriesShort(t, roundIdx, totalRounds) {
  if (!t?.series) return "";
  const remaining = totalRounds - roundIdx;
  let tier = t.series; // "Bo1" | "Bo3" | "Bo5"
  if (tier === "Bo1") {
    if (t.bo3_from === "semis" && remaining <= 2) tier = "Bo3";
    else if (t.bo3_from === "final" && remaining === 1) tier = "Bo3";
  }
  if (tier !== "Bo5") {
    if (t.bo5_from === "semis" && remaining <= 2) tier = "Bo5";
    else if (t.bo5_from === "final" && remaining === 1) tier = "Bo5";
  }
  return tier;
}

export function firstToFor(tier) {
  if (tier === "Bo5") return 3;
  if (tier === "Bo3") return 2;
  return 1;
}

export function totalRoundsOf(bracket) {
  return Math.log2(bracket.rounds[0].length) + 1;
}
