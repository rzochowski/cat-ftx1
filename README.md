# cat-ftx1
CAT-Based Graphic Remote Control Software for Yaesu FTX-1.

A Node.js and browser-based application for control the Yaesu FTX-1 radio transceiver using the CAT (Computer Aided Transceiver) protocol over USB serial.

The solution is designed to make it easier to use the transceiver by eliminating the need to click through multiple menu options. 
The technology used allows the application to run on various operating systems including Windows, macOS, and Linux

The app works by establishing a connection and identifying the transceiver. Once the FTX-1 is detected, auto-information mode is activated, which sends all parameter changes to the app; these changes are then displayed graphically in the web browser.

![FTX-1 Console Screenshot](https://github.com/rzochowski/cat-ftx1/blob/main/docs/ui-screenshot.png)

Changes:
Added functionality to remember the last selected port and baud rate.
Added the ability to change numerical values using the mouse scroll wheel (frequency, dnr, pwr, mic gain, amc, proc level, and vox gain).
Added selectors for band, modulation mode, CTCSS and DCS tones.
Adjustment of volume, squelch, and RF gain via mouse click.
Added support for band scope with distinction between main and sub vfo.
Added information about the transceiver firmware versions.

The program is still in the early phase and may contain errors; it uses actual transceiver responses, which sometimes differ from those in the Yaesu CAT manual.
In some cases, the transceiver?s responses are incorrect (e.g., setting the squelch on VFO Sub correctly sets the value, but the transceiver reports that the value for VFO Main has been changed).

Due to the large amount of data being transmitted, the best performance is achieved by setting the CAT port to 115200 bps in the transceiver?s configuration.

**Author:** SP9AX
