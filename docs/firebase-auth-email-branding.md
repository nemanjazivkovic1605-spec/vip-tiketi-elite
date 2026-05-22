# Elite VIP Tips Firebase Auth email setup

Ovaj fajl pokriva deo koji se ne menja iz React/Vite koda, već iz Firebase Console i Cloudflare DNS-a.

## Firebase Auth action URL

U Firebase Console otvori:

Authentication -> Templates -> bilo koji email template -> edit -> Customize action URL

Postavi:

```text
https://eliteviptips.com/auth-action
```

Aplikacija ima i fallback rutu:

```text
https://eliteviptips.com/__/auth/action
```

Nakon potvrde emaila korisnik se vraća na:

```text
https://eliteviptips.com/login
```

## Sender i app name

U Firebase Console:

Project settings -> General -> Public-facing name:

```text
Elite VIP Tips
```

Authentication -> Templates -> Email address verification:

```text
Sender name: Elite VIP Tips
Reply-to: support@eliteviptips.com
Subject: Potvrdite vašu email adresu - Elite VIP Tips
```

Authentication -> Templates -> Password reset:

```text
Sender name: Elite VIP Tips Support
Reply-to: support@eliteviptips.com
Subject: Reset lozinke - Elite VIP Tips
```

Ako Firebase traži sender address sa custom domenom, koristi:

```text
support@eliteviptips.com
```

## Email verification template

Ako Firebase editor dozvoljava HTML, koristi ovaj template. Ako prikazuje samo plain text editor, koristi tekst ispod HTML-a i dugme će biti Firebase `%LINK%` link.

```html
<div style="margin:0;padding:32px;background:#050505;color:#f5f5f5;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:560px;margin:0 auto;border:1px solid rgba(245,158,11,.28);border-radius:24px;background:#111;padding:32px;box-shadow:0 24px 80px rgba(245,158,11,.16);">
    <div style="font-size:13px;letter-spacing:4px;text-transform:uppercase;color:#f59e0b;font-weight:800;">Elite VIP Tips</div>
    <h1 style="margin:18px 0 12px;font-size:28px;line-height:1.2;color:#fff;">Potvrdite vašu email adresu</h1>
    <p style="font-size:15px;line-height:1.7;color:#c7c7c7;">Dobrodošli u Elite VIP Tips. Potvrdite email adresu kako biste nastavili sa korišćenjem naloga i pristupom sadržaju koji vam je odobren.</p>
    <a href="%LINK%" style="display:inline-block;margin-top:24px;padding:15px 22px;border-radius:14px;background:#f59e0b;color:#000;text-decoration:none;font-weight:900;">Potvrdi email adresu</a>
    <p style="margin-top:28px;font-size:12px;line-height:1.6;color:#777;">Ako niste napravili nalog na Elite VIP Tips platformi, ignorišite ovu poruku.</p>
  </div>
</div>
```

Plain text fallback:

```text
Dobrodošli u Elite VIP Tips.

Potvrdite vašu email adresu klikom na link:
%LINK%

Ako niste napravili nalog na Elite VIP Tips platformi, ignorišite ovu poruku.
```

## Password reset template

```html
<div style="margin:0;padding:32px;background:#050505;color:#f5f5f5;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:560px;margin:0 auto;border:1px solid rgba(245,158,11,.28);border-radius:24px;background:#111;padding:32px;box-shadow:0 24px 80px rgba(245,158,11,.16);">
    <div style="font-size:13px;letter-spacing:4px;text-transform:uppercase;color:#f59e0b;font-weight:800;">Elite VIP Tips Support</div>
    <h1 style="margin:18px 0 12px;font-size:28px;line-height:1.2;color:#fff;">Reset lozinke</h1>
    <p style="font-size:15px;line-height:1.7;color:#c7c7c7;">Primili smo zahtev za promenu lozinke za vaš Elite VIP Tips nalog.</p>
    <a href="%LINK%" style="display:inline-block;margin-top:24px;padding:15px 22px;border-radius:14px;background:#f59e0b;color:#000;text-decoration:none;font-weight:900;">Resetuj lozinku</a>
    <p style="margin-top:28px;font-size:12px;line-height:1.6;color:#777;">Ako niste tražili reset lozinke, možete ignorisati ovu poruku.</p>
  </div>
</div>
```

Plain text fallback:

```text
Primili smo zahtev za reset lozinke za vaš Elite VIP Tips nalog.

Resetujte lozinku klikom na link:
%LINK%

Ako niste tražili reset lozinke, ignorišite ovu poruku.
```

## Welcome email preko EmailJS

Aplikacija može poslati welcome email nakon registracije ako je dodat poseban EmailJS template:

```text
VITE_EMAILJS_WELCOME_TEMPLATE_ID=template_xxxxx
```

Template polja:

```text
{{name}}
{{email}}
{{to_email}}
{{reply_to}}
{{support_email}}
{{title}}
{{plan_name}}
{{login_url}}
{{message}}
```

Predlog subject-a:

```text
Dobrodošli u Elite VIP Tips
```

## SPF, DKIM, DMARC

U Cloudflare DNS dodaj zapise koje Firebase prikaže u template custom domain setup-u. Firebase će dati tačne TXT/CNAME vrednosti.

DMARC osnovni zapis:

```text
Type: TXT
Name: _dmarc
Value: v=DMARC1; p=none; rua=mailto:support@eliteviptips.com; adkim=s; aspf=s
Proxy: DNS only
```

Ako Cloudflare već ima SPF TXT zapis za root domen, nemoj praviti drugi SPF. Spoji Firebase vrednost u postojeći `v=spf1 ...` zapis.
