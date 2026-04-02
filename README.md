# cat-ftx1
CAT-Based Graphic Remote Control Software for Yaesu FTX-1.

A Node.js and browser-based application for control the Yaesu FTX-1 radio transceiver using the CAT (Computer Aided Transceiver) protocol over USB serial.

The solution is designed to make it easier to use the transceiver by eliminating the need to click through multiple menu options. 
The technology used allows the application to run on various operating systems including Windows, macOS, and Linux

The app works by establishing a connection and identifying the tuner. Once the FTX-1 tuner is detected, auto-information mode is activated, which sends all parameter changes to the app; these changes are then displayed graphically in the web browser.

![FTX-1 Console Screenshot](https://github.com/rzochowski/cat-ftx1/blob/main/docs/ui-screenshot.png)

**Author:** SP9AX
