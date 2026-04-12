# cat-ftx1
CAT-Based Graphic Remote Control Software for Yaesu FTX-1.

A Node.js and browser-based application for control the Yaesu FTX-1 radio transceiver using the CAT (Computer Aided Transceiver) protocol over USB serial.

The solution is designed to make it easier to use the transceiver by eliminating the need to click through multiple menu options. 
The technology used allows the application to run on various operating systems including Windows, macOS, and Linux

The app works by establishing a connection and identifying the transceiver. Once the FTX-1 is detected, auto-information mode is activated, which sends all parameter changes to the app; these changes are then displayed graphically in the web browser.

![FTX-1 Console Screenshot](https://github.com/rzochowski/cat-ftx1/blob/main/docs/ui-screenshot.png)

### Establishing a Connection ###
The program works correctly on all three CAT interfaces provided by the transceiver.
However, please note the connection parameters defined in the FTX-1 configuration (Operation setting -> General -> CAT-1 rate, CAT-2 rate, CAT-3 rate) must corespond to values in the connection parameters on your computer.
Due to the large amount of data being transmitted, the best performance is achieved by setting the CAT port to 115200 bps in the transceiver\'s configuration.
If you want to use 115200 bps (what is recommeded), you need to firstly set it in FTX-1 Operation settings.
When using the SPA-1 (Optima) amplifier, the CAT-3 port is used for communication with the SPA-1, **do not change then** its parameters.

### Changes ###
Added the ability to select the active VFO (by clicking the green RX button or the entire panel if inactive).
Added UP and DN buttons for the active VFO (they function like microphone buttons).
Added support for presentation and adjustment of received bandwidth, including support for +/- 1200 Hz offset. This feature is available only for Main VFO.
Added quick switching of the Narrow option.
Added reading configuration of the "SQL / RF / SQL only for FM" operating modes, combined with display rf gain and squelch sliders for both VFO.
Added control of Att, AMP and AGC mode switching.
If an Optima amplifier is detected, the ability to select an antenna for HF has been added.
Added functionality to remember the last selected port and baud rate.
Added the ability to change numerical values using the mouse scroll wheel (frequency, DNR, PWR, MIC GAIN, AMC, PROC LEVEL and VOX GAIN).
Added selectors for band, modulation mode, CTCSS and DCS tones.
Adjustment of volume, squelch, and RF gain via mouse click.
Added support for band scope settings with distinction between main and sub VFO.
Added information about the transceiver firmware versions.

### Working with FTX-1 Memory ###
Currently, the program does not access the internal channels memory of the FTX-1 in any way.
The function for saving and recalling stored frequencies is handled by the program. When the “SAVE CH: Add” button is pressed, the current frequency, modulation type and tone squelch parameters are saved in local storage.

### General notes ###
The program is still in the early phase and may contain errors; it uses actual transceiver responses, which sometimes differ from those in the Yaesu CAT manual.
In some cases, the transceiver\'s responses are incorrect (e.g., setting the squelch on VFO Sub correctly sets the value, but the transceiver reports that the value for VFO Main has been changed).
The direction of the program\'s future development will depend on users feedback.

**Author:** SP9AX
