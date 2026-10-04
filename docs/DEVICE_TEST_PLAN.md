# Hand test on real devices

The automatic tests run in Chromium on a computer. They cannot prove that Pesa works on a real phone. Do this once on each device before a shop depends on Pesa, and again after big releases. Tick each line and write down the device, browser and version.

Devices to cover as a minimum: one cheap Android phone (Chrome), one newer Android phone, one iPhone (Safari, added to the Home Screen), one Windows or Chromebook computer, one tablet if any shop will use one.

| # | Check | Pass |
| --- | --- | --- |
| 1 | Open the Pesa address. The app loads in under 10 seconds on mobile data. | |
| 2 | Install it (Add to Home Screen, or the install prompt). It opens full screen with the Pesa icon. | |
| 3 | Switch on aeroplane mode. Close and reopen Pesa. It still opens. | |
| 4 | Register a test shop, add 5 products, make 3 sales (cash, card, credit) with aeroplane mode on. | |
| 5 | Switch the internet back on. Turn on sync (see `docs/provisioning/README.md`). The status line says Synced. | |
| 6 | On a second device join the shop. Products and sales appear. Make a sale on each device and see both. | |
| 7 | Scan a barcode with the camera. Allow the camera when asked. | |
| 8 | Print or share a receipt. Try PDF, and Bluetooth printing if a printer is on hand. | |
| 9 | Download the monthly accounting pack in PDF and Excel. Open both in the phone's own apps. | |
| 10 | Messages: send a text, a photo from the gallery, a photo from the camera, and a 10 second voice note. Play it on the other device. | |
| 11 | Messages offline: switch the internet off, send a text. A clock shows. Switch on. It arrives and the clock goes. | |
| 12 | Tap the phone button in a chat. The dialer opens with the right number. | |
| 13 | Training: play a lesson. Open Narrator voice, pick a male American voice, tap Hear. | |
| 14 | Type in the chat with the keyboard open. The input stays visible and the chat does not jump. | |
| 15 | Rotate the phone. Nothing is cut off. | |
| 16 | Use Pesa for 15 minutes on a 2 GB RAM phone. It does not freeze or restart. | |
| 17 | Fingerprint or face sign in, if the device has it. | |
| 18 | Turn the phone language to Afrikaans, then German. Screens still fit. | |

Write problems in the Pilot feedback form inside Pesa, or in a list with the device name and a screenshot, and send them to the developer.

Known limits to expect, not bugs: calls are made by the phone network (Pesa only opens the dialer), voice lists depend on the voices installed on the device, and Safari on iPhone only lets a web app record audio after a tap and may ask for the microphone each time.
