Pod::Spec.new do |s|
  s.name           = 'ChatBrowser'
  s.version        = '1.0.0'
  s.summary        = 'System browser view with a collapsed chat bar'
  s.author         = ''
  s.homepage       = 'https://github.com/AStoyanov2231/qr-chat'
  s.license        = 'MIT'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.swift'
end
