# -*- encoding: utf-8 -*-
# stub: manpages 0.6.1 ruby lib

Gem::Specification.new do |s|
  s.name = "manpages".freeze
  s.version = "0.6.1".freeze

  s.required_rubygems_version = Gem::Requirement.new(">= 0".freeze) if s.respond_to? :required_rubygems_version=
  s.require_paths = ["lib".freeze]
  s.authors = ["Bodo Tasche".freeze]
  s.bindir = "exe".freeze
  s.date = "2017-02-05"
  s.description = "With this gem the rubygems command will detect man pages within gems and exposes them to the man command.".freeze
  s.email = ["bodo@tasche.me".freeze]
  s.homepage = "https://github.com/bitboxer/manpages".freeze
  s.licenses = ["MIT".freeze]
  s.rubygems_version = "2.5.1".freeze
  s.summary = "Adds support for man pages to rubygems".freeze

  s.installed_by_version = "3.5.22".freeze

  s.specification_version = 4

  s.add_development_dependency(%q<bundler>.freeze, ["~> 1.8".freeze])
  s.add_development_dependency(%q<rake>.freeze, ["~> 10.0".freeze])
  s.add_development_dependency(%q<rspec>.freeze, ["~> 3.0".freeze])
  s.add_development_dependency(%q<pry>.freeze, ["~> 0".freeze])
  s.add_development_dependency(%q<rubocop>.freeze, ["~> 0.44.1".freeze])
end
