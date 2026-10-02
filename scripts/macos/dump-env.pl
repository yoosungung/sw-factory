#!/usr/bin/perl
# NUL-delimited key=value dump of the current environment.
# macOS printenv has no -0; perl ships at /usr/bin/perl.
use strict;
use warnings;

my $path = $ARGV[0] // die "missing dump path\n";
open my $fh, ">:raw", $path or die "open $path: $!\n";
for my $key (sort keys %ENV) {
  next unless $key =~ /^[A-Za-z_][A-Za-z0-9_]*\z/;
  my $val = $ENV{$key} // "";
  next if index($val, "\0") >= 0;
  print $fh $key, "=", $val, "\0";
}
close $fh or die "close: $!\n";
