# Firefox Accessibility Developer Tools

This extension adds a tab to the devtools panel that allows developers to probe
the accessibility API and get a greater understanding on how assistive
technologies interact with the page content.

## Usage

You can generate an XPI by calling `make`.

## Development

If you have mozrunner, you can simply do `make run` to try the extension in a
clean profile. Set the `FIREFOX_BINARY` to your preferred version of Firefox.

You can also use a [proxy file](https://developer.mozilla.org/en-US/Add-ons/Setting_up_extension_development_environment#Firefox_extension_proxy_file) to this directory and run this extension with a
persistent profile.