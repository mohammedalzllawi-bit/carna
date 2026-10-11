import 'dart:io';

const apiBaseUrl = String.fromEnvironment('API_BASE_URL');

String? apiConfigurationError(String value, {required bool release}) {
  if (value.isEmpty) {
    return 'API_BASE_URL is missing. Build with --dart-define=API_BASE_URL=...';
  }
  final uri = Uri.tryParse(value);
  if (uri == null ||
      !uri.hasAuthority ||
      uri.host.isEmpty ||
      !['https', 'http'].contains(uri.scheme) ||
      uri.userInfo.isNotEmpty ||
      uri.hasQuery ||
      uri.hasFragment ||
      (uri.path.isNotEmpty && uri.path != '/')) {
    return 'API_BASE_URL must be an HTTP(S) origin without credentials or a path.';
  }
  if (release && (uri.scheme != 'https' || _isLocalHost(uri.host))) {
    return 'Release builds require a public HTTPS API, not a laptop or emulator.';
  }
  if (uri.scheme == 'http' &&
      !['localhost', '127.0.0.1', '10.0.2.2'].contains(uri.host)) {
    return 'HTTP is allowed only for explicit local debugging addresses.';
  }
  return null;
}

bool _isLocalHost(String host) {
  final name = host.toLowerCase().replaceFirst(RegExp(r'\.$'), '');
  if (name == 'localhost' ||
      ['.localhost', '.local', '.internal'].any(name.endsWith)) {
    return true;
  }
  final address = InternetAddress.tryParse(name);
  if (address == null) {
    return false;
  }
  if (address.isLoopback || address.isLinkLocal || address.isMulticast) {
    return true;
  }
  final bytes = address.rawAddress;
  if (bytes.every((byte) => byte == 0)) {
    return true;
  }
  if (address.type == InternetAddressType.IPv6) {
    if ((bytes[0] & 0xfe) == 0xfc) {
      return true;
    }
    if (!bytes.take(10).every((byte) => byte == 0) ||
        bytes[10] != 255 ||
        bytes[11] != 255) {
      return false;
    }
    return _privateIpv4(bytes.sublist(12));
  }
  return _privateIpv4(bytes);
}

bool _privateIpv4(List<int> bytes) =>
    bytes[0] == 0 ||
    bytes[0] == 10 ||
    bytes[0] == 127 ||
    (bytes[0] == 172 && bytes[1] >= 16 && bytes[1] <= 31) ||
    (bytes[0] == 192 && bytes[1] == 168);
